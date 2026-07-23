const DANGER_TREND_PENALTY = 20;
const WARNING_TREND_PENALTY = 10;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toneForScore(score) {
  if (score >= 90) return 'success';
  if (score >= 70) return 'warning';
  return 'danger';
}

function labelForScore(score) {
  if (score >= 90) return 'Healthy';
  if (score >= 70) return 'Needs attention';
  return 'Critical';
}

// Computes a 0-100 workflow health score from whatever metrics are actually
// available for the current selection: success rate is the base, and a
// trend-based penalty only applies when the trend engine had enough runs to
// produce alerts for that same selection — a workflow with too little
// history to detect a trend is scored on its success rate alone instead of
// being penalized for missing data.
export function calculateHealthScore({ successRate, totalRuns, trendAlerts = [] }) {
  if (!totalRuns || totalRuns <= 0) {
    return { score: null, tone: 'info', label: 'No data' };
  }

  const baseScore = clamp((successRate || 0) * 100, 0, 100);
  const hasDangerTrend = trendAlerts.some(alert => alert.severity === 'danger');
  const hasWarningTrend = trendAlerts.some(alert => alert.severity === 'warning');

  const penalty = hasDangerTrend
    ? DANGER_TREND_PENALTY
    : hasWarningTrend
      ? WARNING_TREND_PENALTY
      : 0;

  const score = Math.round(clamp(baseScore - penalty, 0, 100));

  return {
    score,
    tone: toneForScore(score),
    label: labelForScore(score)
  };
}
