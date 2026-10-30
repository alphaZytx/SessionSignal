import { requireSupabaseConfig } from '../../web/src/lib/supabaseClient.js';

const ACTIVE_STALE_MS = 20_000;

function toLegacyPayload(snapshot) {
  const metrics = snapshot.metrics || {};
  return {
    studentId: snapshot.participant_id,
    studentName: snapshot.student_display_name,
    sessionId: snapshot.session_id,
    timestamp: Date.parse(snapshot.captured_at),
    payloadVersion: snapshot.payload_version || '1.0',
    faceDetected: snapshot.signal_state === 'observable',
    attentionScore: snapshot.interval_attention_score,
    emotion: snapshot.primary_emotion || metrics.modes?.emotion || 'neutral',
    blinkRate: snapshot.blink_rate,
    drowsinessScore: snapshot.drowsiness_score,
    headPoseCategory: snapshot.head_pose_category,
    aggregates: metrics
  };
}

function broadcastRecord(message) {
  return message?.payload || message?.record || message;
}

export class SupabaseHandler {
  constructor(_serverUrl, onEvent) {
    this.client = requireSupabaseConfig();
    this.onEvent = onEvent;
    this.connected = false;
    this.channel = null;
    this.currentSession = null;
    this.latestByParticipant = new Map();
    this.participants = new Map();
    this.seenSnapshots = new Set();
    this.eventBuffer = [];
    this.hydrating = false;
    this.refreshTimer = null;
    this.subscriptionReady = false;
    this.rehydratingReconnect = false;
    this._connect();
  }

  get isConnected() {
    return this.connected;
  }

  async _connect() {
    const { data: { user }, error } = await this.client.auth.getUser();
    if (error || !user) {
      this.onEvent('disconnect', { connected: false, reason: 'authentication_required' });
      return;
    }
    this.connected = true;
    this.onEvent('connect', { connected: true });

    const { data: activeSession } = await this.client
      .from('sessions')
      .select('id, session_code, status, started_at')
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeSession) await this.joinSession(activeSession.id);
  }

  async startSession() {
    const { data, error } = await this.client.rpc('create_class_session');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const response = {
      success: true,
      sessionId: row.session_id,
      sessionCode: row.session_code,
      startedAt: row.started_at
    };
    await this.joinSession(response.sessionId);
    this.onEvent('session:created', response);
    return response;
  }

  async joinSession(sessionId) {
    if (!sessionId) return;
    await this._removeChannel();
    this.hydrating = true;
    this.eventBuffer = [];
    this.subscriptionReady = false;

    const { data: session, error: sessionError } = await this.client
      .from('sessions')
      .select('id, session_code, status, started_at, ended_at')
      .eq('id', sessionId)
      .single();
    if (sessionError) {
      this.hydrating = false;
      this.onEvent('health_warning', { message: 'The requested session is unavailable or not owned by this facilitator.' });
      return;
    }
    this.currentSession = session;
    this.latestByParticipant.clear();
    this.participants.clear();
    this.seenSnapshots.clear();

    await this.client.realtime.setAuth();
    this.channel = this.client
      .channel(`sessionsignal:teacher-session:${session.id}`, { config: { private: true } })
      .on('broadcast', { event: 'snapshot_inserted' }, (message) => this._receive('snapshot', broadcastRecord(message)))
      .on('broadcast', { event: 'participant_joined' }, (message) => this._receive('participant', broadcastRecord(message)))
      .on('broadcast', { event: 'participant_status' }, (message) => this._receive('status', broadcastRecord(message)))
      .on('broadcast', { event: 'session_ended' }, (message) => this._receive('ended', broadcastRecord(message)))
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          this.onEvent('connect', { connected: true });
          if (this.subscriptionReady && !this.hydrating) this._rehydrateAfterReconnect();
          this.subscriptionReady = true;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.connected = false;
          this.onEvent('disconnect', { connected: false, reason: status, error: err?.message });
        }
      });

    const [{ data: participants, error: participantsError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
      this.client
        .from('session_participants')
        .select('id, display_name, status, joined_at, last_seen_at')
        .eq('session_id', session.id)
        .order('joined_at', { ascending: true }),
      this.client.rpc('get_session_latest_snapshots', { p_session_id: session.id })
    ]);
    if (participantsError || snapshotsError) {
      this.hydrating = false;
      throw participantsError || snapshotsError;
    }

    for (const participant of participants || []) this.participants.set(participant.id, participant);
    for (const snapshot of snapshots || []) {
      this.seenSnapshots.add(snapshot.id);
      if (!this.latestByParticipant.has(snapshot.participant_id)) {
        this.latestByParticipant.set(snapshot.participant_id, snapshot);
      }
    }

    const studentList = [...this.participants.values()].map((participant) => {
      const snapshot = this.latestByParticipant.get(participant.id);
      return {
        studentId: participant.id,
        name: participant.display_name,
        active: this._isParticipantActive(participant),
        lastPayload: snapshot ? toLegacyPayload(snapshot) : null,
        status: participant.status,
        lastSeenAt: participant.last_seen_at
      };
    });

    this.onEvent('session:state', {
      sessionId: session.id,
      sessionCode: session.session_code,
      startTime: Date.parse(session.started_at),
      status: session.status,
      students: studentList
    });
    this._emitClassSummary();

    this.hydrating = false;
    for (const buffered of this.eventBuffer.splice(0)) this._applyEvent(buffered.type, buffered.payload);
    this._startRefresh();
  }

  async endSession(sessionId) {
    const { data, error } = await this.client.rpc('end_class_session', { p_session_id: sessionId });
    if (error) throw error;
    await this._removeChannel();
    this.currentSession = null;
    return Array.isArray(data) ? data[0] : data;
  }

  _receive(type, payload) {
    if (this.hydrating) this.eventBuffer.push({ type, payload });
    else this._applyEvent(type, payload);
  }

  _applyEvent(type, payload) {
    if (!payload) return;
    if (type === 'snapshot') {
      const id = payload.snapshotId || payload.id;
      if (id && this.seenSnapshots.has(id)) return;
      if (id) this.seenSnapshots.add(id);
      const participantId = payload.participantId || payload.participant_id;
      const name = payload.name || this.participants.get(participantId)?.display_name || 'Participant';
      const snapshot = {
        id,
        participant_id: participantId,
        session_id: payload.sessionId || payload.session_id,
        student_display_name: name,
        captured_at: payload.capturedAt || payload.captured_at,
        payload_version: payload.payloadVersion || '1.0',
        signal_state: payload.signalState || 'observable',
        metrics: payload.metrics || {}
      };
      snapshot.interval_attention_score = snapshot.metrics.computed?.intervalAttentionScore ?? null;
      snapshot.primary_emotion = snapshot.metrics.modes?.emotion || 'neutral';
      snapshot.blink_rate = snapshot.metrics.blinkRate?.mean ?? null;
      snapshot.drowsiness_score = snapshot.metrics.drowsinessScore?.mean ?? null;
      snapshot.head_pose_category = snapshot.metrics.modes?.headPoseCategory || 'forward';
      this.latestByParticipant.set(participantId, snapshot);
      const participant = this.participants.get(participantId);
      if (participant) {
        participant.status = 'connected';
        participant.last_seen_at = snapshot.captured_at;
      }
      const legacy = toLegacyPayload(snapshot);
      this.onEvent('session:student-update', { studentId: participantId, name, payload: legacy, timestamp: Date.now() });
      this._emitClassSummary();
      return;
    }

    const participantId = payload.participantId || payload.participant_id;
    if (type === 'participant') {
      const isNew = !this.participants.has(participantId);
      this.participants.set(participantId, {
        id: participantId,
        display_name: payload.name,
        status: payload.status || 'connected',
        last_seen_at: payload.lastSeenAt || new Date().toISOString()
      });
      if (isNew) {
        this.onEvent('teacher:student-joined', {
          studentId: participantId,
          name: payload.name,
          totalStudents: this.participants.size
        });
      }
      return;
    }
    if (type === 'status') {
      const participant = this.participants.get(participantId);
      if (participant) {
        participant.status = payload.status;
        participant.last_seen_at = payload.lastSeenAt || participant.last_seen_at;
      }
      if (payload.status !== 'connected') {
        this.onEvent('teacher:student-disconnected', { studentId: participantId, status: payload.status });
      }
      this._emitClassSummary();
      return;
    }
    if (type === 'ended') {
      this.onEvent('session:ended', payload);
    }
  }

  _isParticipantActive(participant) {
    const activeStatus = ['connected', 'reconnecting'].includes(participant.status);
    return activeStatus && Date.now() - Date.parse(participant.last_seen_at) < ACTIVE_STALE_MS;
  }

  _emitClassSummary() {
    const activeParticipants = [...this.participants.values()]
      .filter((participant) => this._isParticipantActive(participant));
    const rows = activeParticipants
      .map((participant) => ({ participant, snapshot: this.latestByParticipant.get(participant.id) }))
      .filter(({ snapshot }) => snapshot);

    const attentionDistribution = { highly_focused: 0, focused: 0, neutral: 0, distracted: 0, disengaged: 0 };
    const classEmotionDistribution = { focused: 0, confused: 0, bored: 0, engaged: 0, distracted: 0, drowsy: 0, neutral: 0 };
    const lowAttentionStudents = [];
    let sum = 0;
    let observableCount = 0;
    let studentsWithAlerts = 0;

    for (const { participant, snapshot } of rows) {
      const metrics = snapshot.metrics || {};
      const score = metrics.computed?.intervalAttentionScore;
      const signalState = snapshot.signal_state || metrics.signalState || 'observable';
      if (signalState !== 'observable' || !Number.isFinite(score)) continue;
      sum += score;
      observableCount++;
      if (score >= 80) attentionDistribution.highly_focused++;
      else if (score >= 60) attentionDistribution.focused++;
      else if (score >= 40) attentionDistribution.neutral++;
      else if (score >= 20) attentionDistribution.distracted++;
      else attentionDistribution.disengaged++;
      if (score < 40) lowAttentionStudents.push({ studentId: participant.id, name: participant.display_name, score });
      const emotion = metrics.modes?.emotion || 'neutral';
      if (emotion in classEmotionDistribution) classEmotionDistribution[emotion]++;
      if ((metrics.computed?.alertFlags || []).length) studentsWithAlerts++;
    }

    const mostCommonEmotion = observableCount
      ? (Object.entries(classEmotionDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral')
      : 'neutral';
    this.onEvent('session:class-summary', {
      classAvgAttention: observableCount ? Math.round(sum / observableCount) : null,
      classEmotionDistribution,
      attentionDistribution,
      studentsOnline: activeParticipants.length,
      observableStudents: observableCount,
      studentsWithAlerts,
      mostCommonEmotion,
      lowAttentionStudents,
      classAttentionTrend: 'stable'
    });
  }

  _startRefresh() {
    clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this._refreshParticipants(), 15_000);
  }

  async _rehydrateAfterReconnect() {
    if (!this.currentSession || this.rehydratingReconnect) return;
    this.rehydratingReconnect = true;
    try {
      const { data, error } = await this.client.rpc('get_session_latest_snapshots', {
        p_session_id: this.currentSession.id
      });
      if (error) throw error;
      for (const snapshot of data || []) {
        this._applyEvent('snapshot', {
          snapshotId: snapshot.id,
          sessionId: snapshot.session_id,
          participantId: snapshot.participant_id,
          name: snapshot.student_display_name,
          capturedAt: snapshot.captured_at,
          payloadVersion: snapshot.payload_version,
          signalState: snapshot.signal_state,
          metrics: snapshot.metrics
        });
      }
      await this._refreshParticipants();
    } catch (error) {
      this.onEvent('health_warning', { message: `Live reconnect completed, but state refresh failed: ${error.message}` });
    } finally {
      this.rehydratingReconnect = false;
    }
  }

  async _refreshParticipants() {
    if (!this.currentSession) return;
    const { data, error } = await this.client
      .from('session_participants')
      .select('id, display_name, status, joined_at, last_seen_at')
      .eq('session_id', this.currentSession.id);
    if (error) {
      this.onEvent('health_warning', { message: 'Live state is reconnecting; the last confirmed values may be stale.' });
      return;
    }
    for (const row of data || []) {
      const previous = this.participants.get(row.id);
      this.participants.set(row.id, row);
      if (previous && this._isParticipantActive(previous) && !this._isParticipantActive(row)) {
        this.onEvent('teacher:student-disconnected', { studentId: row.id, status: 'stale' });
      }
    }
    this._emitClassSummary();
  }

  async _removeChannel() {
    clearInterval(this.refreshTimer);
    if (this.channel) await this.client.removeChannel(this.channel);
    this.channel = null;
  }

  async disconnect() {
    await this._removeChannel();
    this.connected = false;
  }
}
