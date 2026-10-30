import test from 'node:test';
import assert from 'node:assert/strict';
import { MonitoringLease } from '../apps/extension/src/monitoringLease.js';
import { TelemetryClient } from '../apps/extension/src/telemetryClient.js';

function installStorage() {
  const values = {};
  globalThis.chrome = { storage: { local: {
    async get(key) { return { [key]: values[key] }; },
    async set(entries) { Object.assign(values, entries); },
    async remove(key) { delete values[key]; }
  } } };
  return values;
}

test('monitoring lease permits one active extension document at a time', async () => {
  installStorage();
  const first = new MonitoringLease();
  const second = new MonitoringLease();
  assert.equal(await first.acquire('session-a'), true);
  assert.equal(await second.acquire('session-a'), false);
  await first.release();
  assert.equal(await second.acquire('session-a'), true);
  await second.release();
});

test('numeric retry queue is bounded and retains newest packets', async () => {
  const values = installStorage();
  const telemetry = Object.create(TelemetryClient.prototype);
  for (let index = 0; index < 40; index++) {
    await telemetry.enqueue({ snapshotId: String(index), capturedAt: new Date(Date.now() + index).toISOString() });
  }
  const queue = values['sessionsignal.numericTelemetryQueue'];
  assert.equal(queue.length, 36);
  assert.equal(queue[0].snapshotId, '4');
  assert.equal(queue.at(-1).snapshotId, '39');
});

test('failed queue flush preserves packets and signals retry', async () => {
  const values = installStorage();
  values['sessionsignal.numericTelemetryQueue'] = [
    { snapshotId: 'one', sessionId: 'current', capturedAt: new Date().toISOString() },
    { snapshotId: 'two', sessionId: 'current', capturedAt: new Date().toISOString() }
  ];
  const telemetry = Object.create(TelemetryClient.prototype);
  telemetry.session = { sessionId: 'current' };
  telemetry._send = async () => { throw new Error('network unavailable'); };
  await assert.rejects(() => telemetry.flushQueue(), /network unavailable/);
  assert.deepEqual(values['sessionsignal.numericTelemetryQueue'].map(item => item.snapshotId), ['one', 'two']);
});
