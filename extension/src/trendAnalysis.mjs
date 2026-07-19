import { getValidRunDuration } from './durationFilters.mjs';

// Minimum number of runs needed to fit a meaningful trend line.
const MIN_RUNS_FOR_TREND = 10;
// Relaxed floor used when the user explicitly asks for a fixed "last N runs"
// window: still show a trend even if a workflow has fewer runs than
// requested, as long as there's enough to fit a trend line at all.
const MIN_RUNS_FOR_TREND_FIXED = 4;
const MIN_DURATION_DELTA_SECONDS = 1;
const FAILURE_RATE_DEGRADATION_POINTS = 1;
const MIN_RECENT_FAILURE_RATE_POINTS = 1;
const DANGER_DELTA_THRESHOLD = 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Fits a least-squares trend line across `values` (ordered oldest to newest,
// evenly spaced by run) and reports the overall direction and the total
// change predicted by that line from the first to the last run in the
// window — this is what answers "is it generally trending up, and by how
// much".
function linearTrend(values) {
  const n = values.length;
  if (n < 2) return null;

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    const dx = index - meanX;
    numerator += dx * (value - meanY);
    denominator += dx * dx;
  });

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;
  const fittedStart = intercept;
  const fittedEnd = intercept + slope * (n - 1);

  return { slope, fittedStart, fittedEnd, totalChange: fittedEnd - fittedStart };
}

function isReliabilityFailure(run) {
  const conclusion = String(run?.conclusion || '').toLowerCase();
  const status = String(run?.status || '').toLowerCase();

  return conclusion === 'failure'
    || conclusion === 'failed'
    || conclusion === 'timed_out'
    || status === 'failure'
    || status === 'failed';
}

function runDateRange(runs) {
  const dates = runs
    .map(run => run.created_at)
    .filter(Boolean)
    .sort();

  return {
    first: dates[0] ? dates[0].split('T')[0] : null,
    latest: dates.at(-1) ? dates.at(-1).split('T')[0] : null
  };
}

function trendId(scope, workflowName, metric) {
  return `${scope}-${workflowName}-${metric}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function severityForDelta(delta) {
  return delta >= DANGER_DELTA_THRESHOLD ? 'danger' : 'warning';
}

function requestedWindowSize(options) {
  const windowSize = Number(options.windowSize);
  return Number.isFinite(windowSize) && windowSize > 0
    ? Math.floor(windowSize)
    : null;
}

// Scopes which runs the trend line gets fit over: either the last N runs the
// user asked for ("fixed-window"), or the whole filtered period
// ("selected-range") when no window size was requested.
function selectTrendScope(sortedRuns, options) {
  const fixedWindowSize = requestedWindowSize(options);

  if (fixedWindowSize) {
    const actualTotal = Math.min(fixedWindowSize, sortedRuns.length);

    if (actualTotal < MIN_RUNS_FOR_TREND_FIXED) {
      return null;
    }

    return {
      scopedRuns: sortedRuns.slice(-actualTotal),
      mode: 'fixed-window',
      requestedWindowSize: fixedWindowSize,
      isCapped: actualTotal < fixedWindowSize,
      availableRunsTotal: sortedRuns.length
    };
  }

  if (sortedRuns.length < MIN_RUNS_FOR_TREND) {
    return null;
  }

  return {
    scopedRuns: sortedRuns,
    mode: 'selected-range',
    requestedWindowSize: null,
    isCapped: false,
    availableRunsTotal: sortedRuns.length
  };
}

function analyzeRunGroup(runs, workflowName, scope, options) {
  // Only runs with a valid duration are considered at all — a run with no
  // usable duration (cancelled, still in progress, missing data) can't
  // contribute a data point to either trend line, so it's dropped up front
  // instead of silently shrinking the "recent"/"window" counts downstream.
  const sortedRuns = [...runs]
    .filter(run => run?.created_at && getValidRunDuration(run) !== null)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const trendScope = selectTrendScope(sortedRuns, options);

  if (!trendScope) {
    return [];
  }

  const { scopedRuns, mode, requestedWindowSize: requestedSize, isCapped, availableRunsTotal } = trendScope;
  const dateRange = runDateRange(scopedRuns);
  const runCount = scopedRuns.length;
  const alerts = [];

  const durationValues = scopedRuns.map(getValidRunDuration);
  const durationTrend = linearTrend(durationValues);

  if (
    durationTrend
    && durationTrend.slope > 0
    && durationTrend.fittedStart > 0
    && durationTrend.totalChange >= MIN_DURATION_DELTA_SECONDS
  ) {
    const increasePercent = (durationTrend.totalChange / durationTrend.fittedStart) * 100;
    alerts.push({
      id: trendId(scope, workflowName, 'performance'),
      type: 'performance',
      severity: severityForDelta(durationTrend.totalChange),
      workflowName,
      scope,
      title: 'Performance degradation',
      summary: `${workflowName} duration is trending up by ${Math.round(increasePercent)}% over the last ${runCount} runs.`,
      previousValue: Math.max(0, durationTrend.fittedStart),
      recentValue: Math.max(0, durationTrend.fittedEnd),
      delta: durationTrend.totalChange,
      unit: 'seconds',
      score: increasePercent,
      runCount,
      mode,
      firstRunDate: dateRange.first,
      latestRunDate: dateRange.latest,
      requestedWindowSize: requestedSize,
      isCapped,
      availableRunsTotal
    });
  }

  const failureValues = scopedRuns.map(run => (isReliabilityFailure(run) ? 1 : 0));
  const failureTrend = linearTrend(failureValues);

  if (
    failureTrend
    && failureTrend.slope > 0
    && failureTrend.fittedEnd * 100 >= MIN_RECENT_FAILURE_RATE_POINTS
    && failureTrend.totalChange * 100 >= FAILURE_RATE_DEGRADATION_POINTS
  ) {
    // Clamp first, then derive delta from the clamped values so "Previous",
    // "Recent" and "Delta" always agree — the raw regression line can dip
    // below 0% or above 100% (nonsensical for a failure rate), and using its
    // unclamped totalChange here would make the displayed delta not match
    // recentValue - previousValue.
    const previousValue = clamp(failureTrend.fittedStart * 100, 0, 100);
    const recentValue = clamp(failureTrend.fittedEnd * 100, 0, 100);
    const deltaPoints = recentValue - previousValue;
    alerts.push({
      id: trendId(scope, workflowName, 'reliability'),
      type: 'reliability',
      severity: severityForDelta(deltaPoints),
      workflowName,
      scope,
      title: 'Reliability degradation',
      summary: `${workflowName} failure rate is trending up by ${Math.round(deltaPoints)} points over the last ${runCount} runs.`,
      previousValue,
      recentValue,
      delta: deltaPoints,
      unit: 'percent',
      score: deltaPoints,
      runCount,
      mode,
      firstRunDate: dateRange.first,
      latestRunDate: dateRange.latest,
      requestedWindowSize: requestedSize,
      isCapped,
      availableRunsTotal
    });
  }

  return alerts;
}

function groupRunsByWorkflow(runs) {
  return runs.reduce((groups, run) => {
    const workflowName = run.workflow_name || 'Unknown workflow';
    if (!groups.has(workflowName)) {
      groups.set(workflowName, []);
    }
    groups.get(workflowName).push(run);
    return groups;
  }, new Map());
}

export function analyzeWorkflowNegativeTrends(runs, options = {}) {
  const fixedWindowSize = requestedWindowSize(options);

  if (!Array.isArray(runs) || runs.length === 0) {
    return {
      alerts: [],
      hasDegradation: false,
      workflowsAnalyzed: 0,
      runsAnalyzed: 0,
      insufficientData: true,
      windowSize: fixedWindowSize,
      comparisonMode: fixedWindowSize ? 'fixed-window' : 'selected-range'
    };
  }

  // Trend alerts only ever consider runs with a valid duration — filtering
  // here (once, up front) keeps "runs analyzed" and the window/capped counts
  // consistent with what the trend lines actually used.
  const validRuns = runs.filter(run => run?.created_at && getValidRunDuration(run) !== null);

  const groupedRuns = groupRunsByWorkflow(validRuns);
  const aggregateAlerts = groupedRuns.size > 1
    ? analyzeRunGroup(
      validRuns,
      'Current selection',
      'selection',
      options
    )
    : [];

  const workflowAlerts = [...groupedRuns.entries()]
    .flatMap(([workflowName, workflowRuns]) => (
      analyzeRunGroup(workflowRuns, workflowName, 'workflow', options)
    ));

  const maxAlerts = Number.isFinite(options.maxAlerts)
    ? options.maxAlerts
    : Number.POSITIVE_INFINITY;
  const alerts = [...aggregateAlerts, ...workflowAlerts]
    .sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === 'danger' ? -1 : 1;
      }
      return b.score - a.score;
    })
    .slice(0, maxAlerts);

  const minRunsRequired = fixedWindowSize
    ? MIN_RUNS_FOR_TREND_FIXED
    : MIN_RUNS_FOR_TREND;

  return {
    alerts,
    hasDegradation: alerts.length > 0,
    workflowsAnalyzed: groupedRuns.size,
    runsAnalyzed: validRuns.length,
    insufficientData: validRuns.length < minRunsRequired,
    windowSize: fixedWindowSize,
    comparisonMode: fixedWindowSize ? 'fixed-window' : 'selected-range'
  };
}
