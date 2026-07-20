import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateHealthScore } from '../src/healthScore.mjs';

test('scores a perfect success rate with no trend alerts as healthy', () => {
  const result = calculateHealthScore({ successRate: 1, totalRuns: 50, trendAlerts: [] });

  assert.equal(result.score, 100);
  assert.equal(result.tone, 'success');
  assert.equal(result.label, 'Healthy');
});

test('reflects the raw success rate when there are no trend alerts', () => {
  const result = calculateHealthScore({ successRate: 0.8, totalRuns: 50, trendAlerts: [] });

  assert.equal(result.score, 80);
  assert.equal(result.tone, 'warning');
  assert.equal(result.label, 'Needs attention');
});

test('applies a bigger penalty for a danger-severity trend than a warning one', () => {
  const withWarning = calculateHealthScore({
    successRate: 0.95,
    totalRuns: 50,
    trendAlerts: [{ severity: 'warning' }]
  });
  const withDanger = calculateHealthScore({
    successRate: 0.95,
    totalRuns: 50,
    trendAlerts: [{ severity: 'danger' }]
  });

  assert.equal(withWarning.score, 85);
  assert.equal(withDanger.score, 75);
  assert.ok(withDanger.score < withWarning.score);
});

test('does not double-penalize when both warning and danger alerts are present', () => {
  const result = calculateHealthScore({
    successRate: 0.95,
    totalRuns: 50,
    trendAlerts: [{ severity: 'warning' }, { severity: 'danger' }]
  });

  assert.equal(result.score, 75);
});

test('clamps the score to 0 instead of going negative', () => {
  const result = calculateHealthScore({
    successRate: 0.1,
    totalRuns: 50,
    trendAlerts: [{ severity: 'danger' }]
  });

  assert.equal(result.score, 0);
  assert.equal(result.tone, 'danger');
  assert.equal(result.label, 'Critical');
});

test('reports no data when there are no runs to score', () => {
  const result = calculateHealthScore({ successRate: 0, totalRuns: 0, trendAlerts: [] });

  assert.equal(result.score, null);
  assert.equal(result.label, 'No data');
});

test('uses green at 90 and above, orange from 70 to 89, red below 70', () => {
  assert.equal(calculateHealthScore({ successRate: 0.90, totalRuns: 50 }).tone, 'success');
  assert.equal(calculateHealthScore({ successRate: 0.89, totalRuns: 50 }).tone, 'warning');
  assert.equal(calculateHealthScore({ successRate: 0.70, totalRuns: 50 }).tone, 'warning');
  assert.equal(calculateHealthScore({ successRate: 0.69, totalRuns: 50 }).tone, 'danger');
});

test('does not penalize when trend data is unavailable (no alerts computed)', () => {
  // A workflow with too little history for a trend check simply has no
  // trend alerts — it should be scored on success rate alone, not treated
  // as if it failed the trend check.
  const result = calculateHealthScore({ successRate: 0.6, totalRuns: 3, trendAlerts: [] });

  assert.equal(result.score, 60);
});
