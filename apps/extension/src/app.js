import { FaceAnalyzer } from './shared/faceAnalyzer.js';
import { DataCollector } from './shared/dataCollector.js';
import { MonitoringLease } from './monitoringLease.js';
import { TelemetryClient } from './telemetryClient.js';

globalThis.SESSIONSIGNAL_MEDIAPIPE_ASSET_BASE = chrome.runtime.getURL('vendor/mediapipe/');

const views = Object.fromEntries(['joinView','consentView','monitorView','terminalView'].map(id => [id, document.getElementById(id)]));
const topStatus = document.getElementById('topStatus');
const joinForm = document.getElementById('joinForm');
const joinMessage = document.getElementById('joinMessage');
const consentCheck = document.getElementById('consentCheck');
const startButton = document.getElementById('startMonitoring');
const cameraMessage = document.getElementById('cameraMessage');
const lease = new MonitoringLease();
let telemetry;
let joined;
let analyzer;
let collector;
let flushTimer;
let chart;
let stopping = false;
let flushInFlight = false;

function show(view) {
  Object.values(views).forEach(element => { element.hidden = element.id !== view; });
  const heading = views[view]?.querySelector('h1');
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}
function setStatus(label, state) { topStatus.textContent = label; topStatus.dataset.state = state; }

function makeChart() {
  chart?.destroy();
  chart = new Chart(document.getElementById('attentionChart'), { type:'line', data:{labels:[],datasets:[{label:'Observable attention estimate',data:[],borderColor:'#5f83ff',backgroundColor:'rgba(95,131,255,.12)',fill:true,tension:.3,pointRadius:0,spanGaps:false}]}, options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{min:0,max:100},x:{display:false}},plugins:{legend:{display:false}}} });
}

function updateMetrics(metrics) {
  const observable = metrics.faceDetected && Number.isFinite(metrics.attentionScore);
  document.getElementById('faceSignal').textContent = observable ? 'Observable' : 'Unavailable';
  document.getElementById('gazeSignal').textContent = observable ? (metrics.gazeOnScreen ? 'On screen' : 'Away') : '—';
  document.getElementById('emotionSignal').textContent = observable ? (metrics.emotion || 'Neutral') : '—';
  document.getElementById('attentionMetric').textContent = observable ? metrics.attentionScore : '—';
  document.getElementById('blinkMetric').textContent = observable ? `${Math.round(metrics.blinkRate || 0)}/min` : '—';
  document.getElementById('eyeMetric').textContent = observable ? `${Math.round((metrics.eyeOpennessAvg || 0) * 100)}%` : '—';
  document.getElementById('poseMetric').textContent = observable ? `${Math.round(metrics.headPosePitch || 0)} / ${Math.round(metrics.headPoseYaw || 0)} / ${Math.round(metrics.headPoseRoll || 0)}` : '—';
  document.getElementById('streakMetric').textContent = observable ? `${Math.round(metrics.focusStreak || 0)} sec` : '—';
  document.getElementById('stateMetric').textContent = observable ? 'Observable' : 'Signal unavailable';
}

async function stopMonitoring(reason = 'stopped', title = 'Monitoring stopped', message = 'Your camera and local analysis have stopped.') {
  if (stopping) return;
  stopping = true;
  clearInterval(flushTimer);
  analyzer?.stop();
  analyzer = null;
  collector = null;
  await lease.release();
  try { await telemetry?.close(reason === 'session_ended' ? null : reason); } catch {}
  setStatus('Not monitoring', 'idle');
  document.getElementById('terminalTitle').textContent = title;
  document.getElementById('terminalMessage').textContent = message;
  show('terminalView');
  stopping = false;
}

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  joinMessage.textContent = 'Validating active session…';
  const data = new FormData(joinForm);
  try {
    telemetry ||= new TelemetryClient(globalThis.SESSIONSIGNAL_CONFIG, {
      onSessionEnded: () => stopMonitoring('session_ended', 'Session ended by facilitator', 'The facilitator ended this session. Camera analysis and numerical sharing have stopped.'),
      onConnection: (status) => {
        if (status === 'SUBSCRIBED') setStatus(analyzer ? 'Camera active · connected' : 'Session connected', analyzer ? 'active' : 'idle');
        else if (analyzer) setStatus('Reconnecting…', 'offline');
      },
      onSync: (time) => { document.getElementById('syncText').textContent = `Last sync ${time.toLocaleTimeString()}`; setStatus('Camera active · connected','active'); },
      onOffline: () => { document.getElementById('syncText').textContent = 'Offline · numerical packets queued'; setStatus('Camera active · offline','offline'); }
    });
    joined = await telemetry.join(String(data.get('displayName')), String(data.get('sessionCode')));
    joined.sessionCode = String(data.get('sessionCode')).trim().toUpperCase();
    joinMessage.textContent = '';
    show('consentView');
  } catch (error) {
    const message = error.message || 'This session could not be joined.';
    joinMessage.textContent = /invalid|ended/i.test(message)
      ? 'That code is invalid or the session has ended. Check the six characters with your facilitator.'
      : message;
  }
});
document.getElementById('sessionCode').addEventListener('input', (event) => {
  event.target.value = event.target.value.replace(/\s+/g, '').toUpperCase().slice(0, 6);
});

consentCheck.addEventListener('change', () => startButton.disabled = !consentCheck.checked);
document.getElementById('cancelJoin').addEventListener('click', async () => { await telemetry?.close('stopped'); joined = null; show('joinView'); });

startButton.addEventListener('click', async () => {
  cameraMessage.textContent = '';
  if (!await lease.acquire(joined.sessionId)) {
    cameraMessage.textContent = 'Monitoring is already active in another SessionSignal Side Panel or tab. Close or stop it there first.';
    return;
  }
  try {
    document.getElementById('monitorName').textContent = joined.displayName;
    document.getElementById('monitorCode').textContent = joined.sessionCode;
    show('monitorView');
    setStatus('Requesting camera…', 'idle');
    makeChart();
    collector = new DataCollector(5000);
    analyzer = new FaceAnalyzer(document.getElementById('videoElement'), document.getElementById('overlayCanvas'), (metrics) => {
      collector.addFrame(metrics);
      updateMetrics(metrics);
    }, { assetBase: globalThis.SESSIONSIGNAL_MEDIAPIPE_ASSET_BASE });
    await analyzer.start();
    setStatus('Camera active · connected', 'active');
    telemetry.setStatus('connected').catch(() => {});
    flushTimer = setInterval(async () => {
      if (flushInFlight) return;
      const aggregate = collector?.flush();
      if (!aggregate) return;
      flushInFlight = true;
      try {
        chart.data.labels.push(new Date().toLocaleTimeString());
        chart.data.datasets[0].data.push(aggregate.computed.intervalAttentionScore);
        if (chart.data.labels.length > 60) { chart.data.labels.shift(); chart.data.datasets[0].data.shift(); }
        chart.update('none');
        await telemetry.submit(aggregate);
      } catch { /* network errors are queued inside telemetry.submit; ignore here */ }
      finally { flushInFlight = false; }
    }, 5000);
  } catch (error) {
    analyzer?.stop();
    analyzer = null;
    await lease.release();
    await telemetry.setStatus('camera_unavailable').catch(() => {});
    show('consentView');
    setStatus('Camera unavailable', 'error');
    cameraMessage.textContent = `Camera monitoring could not start: ${error.message}. Check Chrome permission and whether another app has exclusive camera access.`;
  }
});

document.getElementById('stopMonitoring').addEventListener('click', () => stopMonitoring());
document.getElementById('returnToJoin').addEventListener('click', () => { joined = null; consentCheck.checked = false; startButton.disabled = true; show('joinView'); });
window.addEventListener('pagehide', () => { clearInterval(flushTimer); analyzer?.stop(); lease.release(); telemetry?.setStatus('disconnected').catch(() => {}); });
document.addEventListener('visibilitychange', () => {
  if (!analyzer) return;
  if (document.hidden) setStatus('Camera active · background tab', 'offline');
  else setStatus('Camera active · checking connection', 'active');
});
window.addEventListener('unhandledrejection', (event) => {
  // Only treat this as fatal if it originated from a recognized monitoring error.
  // Supabase realtime, network blips, and background retries all produce benign
  // unhandled rejections that must NOT crash an active monitoring session.
  if (!analyzer) return;
  const reason = event.reason;
  const msg = (reason?.message || String(reason) || '').toLowerCase();
  // Ignore Supabase realtime/channel lifecycle errors — they self-recover.
  if (/websocket|channel|realtime|timed? ?out|network|fetch|failed to fetch/i.test(msg)) {
    event.preventDefault();
    return;
  }
  // Ignore errors thrown from setStatus / set_participant_status — the DB enforces
  // idempotency and these are non-fatal; telemetry continues regardless.
  if (/participant|status|session.*ended|not active|42501/i.test(msg)) {
    event.preventDefault();
    return;
  }
  // Anything else while monitoring is active is treated as fatal.
  event.preventDefault();
  stopMonitoring('stopped', 'Monitoring stopped after an error', 'Your camera has been released. Return to the join screen and try again.');
});

setStatus('Not monitoring', 'idle');
