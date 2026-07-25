import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeWorkflowNegativeTrends, computeWindowSuccessStats } from '../../src/trendAnalysis.mjs';

function run(id, workflowName, day, duration, conclusion = 'success') {
  return {
    id,
    workflow_name: workflowName,
    created_at: `2026-06-${String(day).padStart(2, '0')}T12:00:00Z`,
    duration,
    conclusion,
    status: 'completed'
  };
}

function datedRun(id, workflowName, dayOfYear, duration, conclusion = 'success') {
  const date = new Date(Date.UTC(2026, 0, dayOfYear)).toISOString().slice(0, 10);

  return {
    id,
    workflow_name: workflowName,
    created_at: `${date}T12:00:00Z`,
    duration,
    conclusion,
    status: 'completed'
  };
}

function assertClose(actual, expected, tolerance = 0.1) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test('detects a performance trend line trending up over a workflow\'s runs', () => {
  // A clean linear ramp from 100s to 190s across 10 runs.
  const runs = Array.from({ length: 10 }, (_, index) => run(index + 1, 'Build', index + 1, 100 + index * 10));

  const analysis = analyzeWorkflowNegativeTrends(runs);
  const performanceAlert = analysis.alerts.find(alert => (
    alert.workflowName === 'Build' && alert.type === 'performance'
  ));

  assert.equal(analysis.hasDegradation, true);
  assert.ok(performanceAlert);
  assert.equal(performanceAlert.previousValue, 100);
  assert.equal(performanceAlert.recentValue, 190);
  assert.equal(performanceAlert.delta, 90);
  assert.equal(performanceAlert.severity, 'danger');
  assert.equal(performanceAlert.firstRunDate, '2026-06-01');
  assert.equal(performanceAlert.latestRunDate, '2026-06-10');
});

test('uses the full filtered selection when no fixed window size is requested', () => {
  const runs = Array.from({ length: 20 }, (_, index) => datedRun(index + 1, 'Tests', index + 1, 50 + index * 2));

  const analysis = analyzeWorkflowNegativeTrends(runs);
  const performanceAlert = analysis.alerts.find(alert => (
    alert.workflowName === 'Tests' && alert.type === 'performance'
  ));

  assert.equal(analysis.comparisonMode, 'selected-range');
  assert.ok(performanceAlert);
  assert.equal(performanceAlert.runCount, 20);
  assert.equal(performanceAlert.previousValue, 50);
  assert.equal(performanceAlert.recentValue, 88);
  assert.equal(performanceAlert.firstRunDate, '2026-01-01');
  assert.equal(performanceAlert.latestRunDate, '2026-01-20');
});

test('detects a reliability trend line trending up when failures become more frequent', () => {
  const previousRuns = Array.from({ length: 10 }, (_, index) => (
    run(index + 1, 'Tests', index + 1, 90, 'success')
  ));
  const recentRuns = Array.from({ length: 10 }, (_, index) => (
    run(index + 11, 'Tests', index + 11, 90, [0, 1].includes(index) ? 'failure' : 'success')
  ));

  const analysis = analyzeWorkflowNegativeTrends([...previousRuns, ...recentRuns]);
  const reliabilityAlert = analysis.alerts.find(alert => (
    alert.workflowName === 'Tests' && alert.type === 'reliability'
  ));

  assert.equal(analysis.hasDegradation, true);
  assert.ok(reliabilityAlert);
  assert.equal(reliabilityAlert.severity, 'danger');
  assertClose(reliabilityAlert.delta, 5.71);
});

test('detects small performance and reliability degradations as warnings', () => {
  const performanceRuns = Array.from({ length: 10 }, (_, index) => run(index + 1, 'Build', index + 1, 100 + index * 0.2));
  const previousRuns = Array.from({ length: 10 }, (_, index) => (
    run(index + 1, 'Tests', index + 1, 90, 'success')
  ));
  const recentRuns = Array.from({ length: 10 }, (_, index) => (
    run(index + 11, 'Tests', index + 11, 90, index === 0 ? 'failure' : 'success')
  ));

  const performanceAnalysis = analyzeWorkflowNegativeTrends(performanceRuns);
  const reliabilityAnalysis = analyzeWorkflowNegativeTrends([...previousRuns, ...recentRuns]);

  const performanceAlert = performanceAnalysis.alerts.find(alert => (
    alert.workflowName === 'Build' && alert.type === 'performance'
  ));
  const reliabilityAlert = reliabilityAnalysis.alerts.find(alert => (
    alert.workflowName === 'Tests' && alert.type === 'reliability'
  ));

  assert.ok(performanceAlert);
  assert.equal(performanceAlert.severity, 'warning');
  assertClose(performanceAlert.delta, 1.8, 0.2);

  assert.ok(reliabilityAlert);
  assert.equal(reliabilityAlert.severity, 'warning');
  assertClose(reliabilityAlert.delta, 1.43);
});

test('marks degradations of five or more seconds or points as danger', () => {
  const performanceRuns = Array.from({ length: 10 }, (_, index) => run(index + 1, 'Build', index + 1, 100 + index));
  const previousRuns = Array.from({ length: 10 }, (_, index) => (
    run(index + 1, 'Tests', index + 1, 90, 'success')
  ));
  const recentRuns = Array.from({ length: 10 }, (_, index) => (
    run(index + 11, 'Tests', index + 11, 90, [0, 1].includes(index) ? 'failure' : 'success')
  ));

  const performanceAnalysis = analyzeWorkflowNegativeTrends(performanceRuns);
  const reliabilityAnalysis = analyzeWorkflowNegativeTrends([...previousRuns, ...recentRuns]);

  assert.ok(performanceAnalysis.alerts.some(alert => (
    alert.workflowName === 'Build' && alert.type === 'performance' && alert.severity === 'danger'
  )));
  assert.ok(reliabilityAnalysis.alerts.some(alert => (
    alert.workflowName === 'Tests' && alert.type === 'reliability' && alert.severity === 'danger'
  )));
});

test('applies analysis to the current selection as an aggregate scope', () => {
  const runs = [
    ...Array.from({ length: 10 }, (_, index) => run(index + 1, 'Build', index + 1, 100 + index * 5)),
    ...Array.from({ length: 10 }, (_, index) => run(index + 11, 'Deploy', index + 11, 200 + index * 5))
  ];

  const analysis = analyzeWorkflowNegativeTrends(runs);

  assert.equal(analysis.workflowsAnalyzed, 2);
  assert.ok(analysis.alerts.some(alert => (
    alert.workflowName === 'Current selection' && alert.scope === 'selection'
  )));
});

test('does not alert when there is not enough historical data', () => {
  const runs = Array.from({ length: 6 }, (_, index) => run(index + 1, 'Build', index + 1, 100));

  const analysis = analyzeWorkflowNegativeTrends(runs);

  assert.equal(analysis.hasDegradation, false);
  assert.equal(analysis.insufficientData, true);
  assert.deepEqual(analysis.alerts, []);
});

test('caps a fixed window request to the runs actually available and flags it', () => {
  // Only 5 runs exist for this workflow, but the user asked for a window of 10.
  const runs = [
    ...Array.from({ length: 3 }, (_, index) => run(index + 1, 'Deploy', index + 1, 100)),
    ...Array.from({ length: 2 }, (_, index) => run(index + 4, 'Deploy', index + 4, 180))
  ];

  const analysis = analyzeWorkflowNegativeTrends(runs, { windowSize: 10 });
  const performanceAlert = analysis.alerts.find(alert => (
    alert.workflowName === 'Deploy' && alert.type === 'performance'
  ));

  assert.equal(analysis.comparisonMode, 'fixed-window');
  assert.ok(performanceAlert);
  assert.equal(performanceAlert.isCapped, true);
  assert.equal(performanceAlert.requestedWindowSize, 10);
  assert.equal(performanceAlert.availableRunsTotal, 5);
  assert.equal(performanceAlert.runCount, 5);
});

test('does not flag a fixed window as capped when enough runs exist', () => {
  // 10 older runs the "last 10 runs" window should ignore, then the last 10
  // runs form a clean upward ramp from 100s to 145s.
  const runs = [
    ...Array.from({ length: 10 }, (_, index) => run(index + 1, 'Build', index + 1, 50)),
    ...Array.from({ length: 10 }, (_, index) => run(index + 11, 'Build', index + 11, 100 + index * 5))
  ];

  const analysis = analyzeWorkflowNegativeTrends(runs, { windowSize: 10 });
  const performanceAlert = analysis.alerts.find(alert => (
    alert.workflowName === 'Build' && alert.type === 'performance'
  ));

  assert.ok(performanceAlert);
  assert.equal(performanceAlert.isCapped, false);
  assert.equal(performanceAlert.availableRunsTotal, 20);
  assert.equal(performanceAlert.runCount, 10);
  assert.equal(performanceAlert.previousValue, 100);
  assert.equal(performanceAlert.recentValue, 145);
});

test('still reports insufficient data when even the relaxed fixed-window floor is not met', () => {
  const runs = Array.from({ length: 3 }, (_, index) => run(index + 1, 'Build', index + 1, 100));

  const analysis = analyzeWorkflowNegativeTrends(runs, { windowSize: 10 });

  assert.equal(analysis.hasDegradation, false);
  assert.equal(analysis.insufficientData, true);
  assert.deepEqual(analysis.alerts, []);
});

test('computeWindowSuccessStats reflects the whole period when no window is requested', () => {
  const runs = [
    ...Array.from({ length: 8 }, (_, index) => run(index + 1, 'Build', index + 1, 100, 'success')),
    ...Array.from({ length: 2 }, (_, index) => run(index + 9, 'Build', index + 9, 100, 'failure'))
  ];

  const stats = computeWindowSuccessStats(runs);

  assert.equal(stats.totalRuns, 10);
  assert.equal(stats.successRate, 0.8);
});

test('computeWindowSuccessStats only counts runs within the requested window', () => {
  // 10 old successful runs, then 5 recent runs that are all failures — picking
  // "last 5" should reflect only the recent failures, not the whole history.
  const runs = [
    ...Array.from({ length: 10 }, (_, index) => run(index + 1, 'Build', index + 1, 100, 'success')),
    ...Array.from({ length: 5 }, (_, index) => run(index + 11, 'Build', index + 11, 100, 'failure'))
  ];

  const allTimeStats = computeWindowSuccessStats(runs);
  const windowedStats = computeWindowSuccessStats(runs, { windowSize: 5 });

  assert.equal(allTimeStats.successRate, 10 / 15);
  assert.equal(windowedStats.totalRuns, 5);
  assert.equal(windowedStats.successRate, 0);
});

test('computeWindowSuccessStats does not require a minimum run count to compute a ratio', () => {
  const runs = [run(1, 'Build', 1, 100, 'success'), run(2, 'Build', 2, 100, 'failure')];

  const stats = computeWindowSuccessStats(runs, { windowSize: 10 });

  assert.equal(stats.totalRuns, 2);
  assert.equal(stats.successRate, 0.5);
});
