const { test, expect } = require('@playwright/test');

test('run durations above the max valid window are excluded from duration KPI', async () => {
  const { getValidRunDuration, isRunDurationOutlier } = await import('../src/durationFilters.mjs');
  const corruptedRun = { id: 1, duration: 34670002 };

  expect(isRunDurationOutlier(corruptedRun)).toBe(true);
  expect(getValidRunDuration(corruptedRun)).toBeNull();
});

test('normal run durations remain usable for duration KPI', async () => {
  const { getValidRunDuration, isRunDurationOutlier } = await import('../src/durationFilters.mjs');
  const normalRun = { id: 2, duration: 260 };

  expect(isRunDurationOutlier(normalRun)).toBe(false);
  expect(getValidRunDuration(normalRun)).toBe(260);
});

test('dashboard sanitization preserves the run but removes its invalid duration', async () => {
  const {
    MAX_VALID_RUN_DURATION_SECONDS,
    sanitizeRunDurationForDashboard
  } = await import('../src/durationFilters.mjs');
  const run = {
    id: 3,
    conclusion: 'success',
    duration: MAX_VALID_RUN_DURATION_SECONDS + 1
  };

  const sanitized = sanitizeRunDurationForDashboard(run);

  expect(sanitized.id).toBe(run.id);
  expect(sanitized.conclusion).toBe(run.conclusion);
  expect(sanitized.duration).toBe(0);
  expect(sanitized.originalDuration).toBe(run.duration);
  expect(sanitized.durationExcludedFromStats).toBe(true);
});

test('outlier count ignores missing and zero durations', async () => {
  const { countRunDurationOutliers } = await import('../src/durationFilters.mjs');
  const runs = [
    { id: 1, duration: 0 },
    { id: 2 },
    { id: 3, duration: 120 },
    { id: 4, duration: 34670002 }
  ];

  expect(countRunDurationOutliers(runs)).toBe(1);
});
