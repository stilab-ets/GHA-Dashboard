import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countRunDurationOutliers,
  getValidRunDuration,
  isRunDurationOutlier,
  MAX_VALID_RUN_DURATION_SECONDS,
  sanitizeRunDurationForDashboard,
} from '../../src/durationFilters.mjs';

test('run durations above the max valid window are excluded from duration KPI', () => {
  const corruptedRun = { id: 1, duration: 34670002 };

  assert.equal(isRunDurationOutlier(corruptedRun), true);
  assert.equal(getValidRunDuration(corruptedRun), null);
});

test('normal run durations remain usable for duration KPI', () => {
  const normalRun = { id: 2, duration: 260 };

  assert.equal(isRunDurationOutlier(normalRun), false);
  assert.equal(getValidRunDuration(normalRun), 260);
});

test('dashboard sanitization preserves the run but removes its invalid duration', () => {
  const run = {
    id: 3,
    conclusion: 'success',
    duration: MAX_VALID_RUN_DURATION_SECONDS + 1,
  };

  const sanitized = sanitizeRunDurationForDashboard(run);

  assert.equal(sanitized.id, run.id);
  assert.equal(sanitized.conclusion, run.conclusion);
  assert.equal(sanitized.duration, 0);
  assert.equal(sanitized.originalDuration, run.duration);
  assert.equal(sanitized.durationExcludedFromStats, true);
});

test('outlier count ignores missing and zero durations', () => {
  const runs = [
    { id: 1, duration: 0 },
    { id: 2 },
    { id: 3, duration: 120 },
    { id: 4, duration: 34670002 },
  ];

  assert.equal(countRunDurationOutliers(runs), 1);
});
