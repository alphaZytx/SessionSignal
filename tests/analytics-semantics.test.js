import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../apps/teacher/js/analyticsRepository.js';

const participant = [{ id: 'student-a', display_name: 'Student A' }];

test('historical analytics excludes unavailable samples rather than converting them to zero', () => {
  const result = summarize(participant, [{
    student_id: 'student-a', student_name: 'Student A', signal_state: 'unavailable',
    interval_attention_score: null, gaze_on_screen_pct: 0, drowsiness_score: 0,
    blink_rate: 0, primary_emotion: 'neutral', alert_flags: '', timestamp: Date.now()
  }]);
  assert.equal(result.classAvgAttention, null);
  assert.equal(result.studentSummaries[0].avgAttention, null);
  assert.equal(result.studentSummaries[0].avgGaze, null);
  assert.equal(result.studentSummaries[0].signalUnavailablePct, 100);
});

test('historical observable scores, including a real zero, remain in analytics', () => {
  const result = summarize(participant, [{
    student_id: 'student-a', student_name: 'Student A', signal_state: 'observable',
    interval_attention_score: 0, gaze_on_screen_pct: 20, drowsiness_score: 0.5,
    blink_rate: 10, primary_emotion: 'distracted', alert_flags: 'HIGH_DISTRACTION', timestamp: Date.now()
  }]);
  assert.equal(result.classAvgAttention, 0);
  assert.equal(result.studentSummaries[0].avgAttention, 0);
  assert.equal(result.studentSummaries[0].avgGaze, 20);
  assert.equal(result.studentSummaries[0].totalAlerts, 1);
});
