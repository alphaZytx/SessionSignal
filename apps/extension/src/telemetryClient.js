const QUEUE_KEY = 'sessionsignal.numericTelemetryQueue';
const MAX_QUEUE = 36;
const MAX_AGE_MS = 15 * 60_000;

export class TelemetryClient {
  constructor(config, hooks = {}) {
    if (!config?.url || !config?.publishableKey || config.url.includes('YOUR_PROJECT')) {
      throw new Error('SessionSignal needs its connection configured before you can join a session. Ask the person who shared this beta.');
    }
    this.client = globalThis.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sessionsignal.student.auth' }
    });
    this.hooks = hooks;
    this.channel = null;
    this.session = null;
    this.retrying = false;
    this.retryTimer = null;
  }

  async authenticate() {
    const { data: current } = await this.client.auth.getSession();
    if (current.session?.user) return current.session.user;
    const { data, error } = await this.client.auth.signInAnonymously();
    if (error) throw error;
    return data.user;
  }

  async join(displayName, sessionCode) {
    const user = await this.authenticate();
    const { data, error } = await this.client.rpc('join_class_session', {
      p_session_code: sessionCode.trim().toUpperCase(), p_display_name: displayName.trim()
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    this.session = { userId: user.id, sessionId: row.session_id, participantId: row.participant_id,
      displayName: row.participant_display_name, startedAt: row.session_started_at };
    await chrome.storage.local.set({ 'sessionsignal.studentSession': this.session });
    await this.subscribe();
    return this.session;
  }

  async subscribe() {
    if (!this.session) return;
    if (this.channel) await this.client.removeChannel(this.channel);
    await this.client.realtime.setAuth();
    const topic = `sessionsignal:student-session:${this.session.sessionId}:${this.session.userId}`;
    this.channel = this.client.channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'session_ended' }, (event) => this.hooks.onSessionEnded?.(event.payload || event))
      .subscribe((status) => this.hooks.onConnection?.(status));
  }

  createPacket(metrics) {
    return {
      snapshotId: crypto.randomUUID(), sessionId: this.session.sessionId,
      participantId: this.session.participantId, capturedAt: new Date().toISOString(),
      intervalStartedAt: new Date(metrics.timing.intervalStartTime).toISOString(),
      intervalEndedAt: new Date(metrics.timing.intervalEndTime).toISOString(),
      payloadVersion: '1.0', signalState: metrics.signalState || 'observable', metrics
    };
  }

  async submit(metrics) {
    const packet = this.createPacket(metrics);
    try {
      await this._send(packet);
      this.hooks.onSync?.(new Date());
    } catch (error) {
      await this.enqueue(packet);
      this.hooks.onOffline?.(error);
      this.scheduleRetry();
      return;
    }
    try { await this.flushQueue(); }
    catch (error) { this.hooks.onOffline?.(error); this.scheduleRetry(); }
  }

  async _send(packet) {
    const { data, error } = await this.client.rpc('submit_student_snapshot', {
      p_snapshot_id: packet.snapshotId, p_session_id: packet.sessionId,
      p_participant_id: packet.participantId, p_captured_at: packet.capturedAt,
      p_interval_started_at: packet.intervalStartedAt, p_interval_ended_at: packet.intervalEndedAt,
      p_payload_version: packet.payloadVersion, p_signal_state: packet.signalState, p_metrics: packet.metrics
    });
    if (error) throw error;
    return data;
  }

  async enqueue(packet) {
    const stored = await chrome.storage.local.get(QUEUE_KEY);
    const cutoff = Date.now() - MAX_AGE_MS;
    const queue = (stored[QUEUE_KEY] || []).filter(item => Date.parse(item.capturedAt) >= cutoff);
    queue.push(packet);
    await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(-MAX_QUEUE) });
  }

  async flushQueue() {
    const stored = await chrome.storage.local.get(QUEUE_KEY);
    const queue = (stored[QUEUE_KEY] || []).filter(item => Date.now() - Date.parse(item.capturedAt) <= MAX_AGE_MS);
    const remaining = [];
    let sendError = null;
    let endedSessionId = null;
    for (const packet of queue) {
      if (packet.sessionId !== this.session?.sessionId) {
        remaining.push(packet);
        continue;
      }
      if (packet.sessionId === endedSessionId) continue;
      if (sendError) { remaining.push(packet); continue; }
      try { await this._send(packet); }
      catch (error) {
        if (/ended|inactive|not active/i.test(error.message || '')) endedSessionId = packet.sessionId;
        else { sendError = error; remaining.push(packet); }
      }
    }
    await chrome.storage.local.set({ [QUEUE_KEY]: remaining.slice(-MAX_QUEUE) });
    if (sendError) throw sendError;
  }

  scheduleRetry() {
    if (this.retrying) return;
    this.retrying = true;
    let attempt = 0;
    const retry = async () => {
      if (!this.session) { this.retrying = false; return; }
      try { await this.flushQueue(); this.retrying = false; this.hooks.onConnection?.('SUBSCRIBED'); }
      catch {
        attempt++;
        this.retryTimer = setTimeout(retry, Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500);
      }
    };
    this.retryTimer = setTimeout(retry, 1200);
  }

  async setStatus(status) {
    if (!this.session) return;
    await this.client.rpc('set_participant_status', { p_participant_id: this.session.participantId, p_status: status });
  }

  async discardQueuedSession(sessionId = this.session?.sessionId) {
    if (!sessionId) return;
    const stored = await chrome.storage.local.get(QUEUE_KEY);
    const queue = (stored[QUEUE_KEY] || []).filter((packet) => packet.sessionId !== sessionId);
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  }

  async close(status = 'stopped', { discardQueue = true } = {}) {
    const sessionId = this.session?.sessionId;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retrying = false;
    if (status) try { await this.setStatus(status); } catch {}
    if (discardQueue) await this.discardQueuedSession(sessionId).catch(() => {});
    if (this.channel) await this.client.removeChannel(this.channel);
    this.channel = null;
    this.session = null;
  }
}
