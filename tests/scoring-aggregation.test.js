import test from 'node:test';
import assert from 'node:assert/strict';
import { DataCollector } from '../apps/student/js/dataCollector.js';

function observable(attentionScore, overrides = {}) {
  return {
    faceDetected: true, attentionScore, gazeOnScreen: true, gazeDeviation: 0.1,
    gazeX: 0, gazeY: 0, headPosePitch: 0, headPoseYaw: 0, headPoseRoll: 0,
    headPoseCategory: 'forward', attentionCategory: attentionScore >= 60 ? 'focused' : 'neutral',
    emotion: 'focused', eyeOpennessLeft: 0.8, eyeOpennessRight: 0.8, eyesClosed: false,
    blinkRate: 14, mouthOpenness: 0.1, drowsinessScore: 0, yawnDetected: false,
    ...overrides
  };
}

test('preserves the observable attention mean and five-second payload semantics', () => {
  const collector = new DataCollector(5000);
  collector.addFrame(observable(80));
  collector.addFrame(observable(60));
  const result = collector.flush();
  assert.equal(result.signalState, 'observable');
  assert.equal(result.computed.intervalAttentionScore, 70);
  assert.equal(result.attentionScore.mean, 70);
  assert.deepEqual(result.computed.alertFlags, []);
});

test('does not fabricate a zero attention score when no face is observable', () => {
  const collector = new DataCollector(5000);
  collector.addFrame({ faceDetected: false, attentionScore: null, attentionCategory: 'unavailable', emotion: 'neutral' });
  collector.addFrame({ faceDetected: false, attentionScore: null, attentionCategory: 'unavailable', emotion: 'neutral' });
  const result = collector.flush();
  assert.equal(result.signalState, 'unavailable');
  assert.equal(result.computed.intervalAttentionScore, null);
  assert.deepEqual(result.computed.alertFlags, []);
  assert.equal(result.percentages.faceDetected, 0);
});

test('missing-face frames do not pull down scores from observable frames', () => {
  const collector = new DataCollector(5000);
  collector.addFrame(observable(82));
  collector.addFrame({ faceDetected: false, attentionScore: null, attentionCategory: 'unavailable', emotion: 'neutral' });
  const result = collector.flush();
  assert.equal(result.signalState, 'observable');
  assert.equal(result.computed.intervalAttentionScore, 82);
  assert.equal(result.percentages.faceDetected, 50);
});
