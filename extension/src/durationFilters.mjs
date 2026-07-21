export const MAX_DAYS = 399;
export const MAX_VALID_RUN_DURATION_SECONDS = MAX_DAYS * 24 * 60 * 60;

export function normalizeDurationSeconds(value) {
  const duration = Number(value);
  return Number.isFinite(duration) ? duration : null;
}

export function isRunDurationOutlier(run) {
  const duration = normalizeDurationSeconds(run?.duration);
  return duration !== null && duration > MAX_VALID_RUN_DURATION_SECONDS;
}

export function getValidRunDuration(run) {
  const duration = normalizeDurationSeconds(run?.duration);
  if (duration === null || duration <= 0 || duration > MAX_VALID_RUN_DURATION_SECONDS) {
    return null;
  }
  return duration;
}

export function countRunDurationOutliers(runs) {
  if (!Array.isArray(runs)) return 0;
  return runs.filter(isRunDurationOutlier).length;
}

export function sanitizeRunDurationForDashboard(run) {
  if (!isRunDurationOutlier(run)) {
    return run;
  }

  return {
    ...run,
    originalDuration: normalizeDurationSeconds(run.duration),
    duration: 0,
    durationExcludedFromStats: true
  };
}

export function isWorkflowYamlFile(filePath) {
  const normalizedPath = String(filePath ?? '').trim().replace(/\\/g, '/').toLowerCase();
  return normalizedPath.startsWith('.github/workflows/') && /\.(yml|yaml)$/.test(normalizedPath);
}
