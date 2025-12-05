// ============================================
// WebSocket Client
// ============================================

// Global Chrome storage events are shared across all extension contexts.
// To avoid dashboards overwriting each other's state, we keep a cache of
// runs per repository, and always use the repo passed into the public
// functions instead of a mutable global "current repo".
const _runsByRepo = new Map();

const _progressCallbacks = new Map();
const _pendingResolves = new Map();
const _pendingRejects = new Map();

if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    
    // Runs change
    if (changes.wsRuns) {
      const newRuns = changes.wsRuns.newValue || [];

      // When runs change, also read wsStatus to know for which repo the
      // background script is currently streaming. This ensures we store
      // the data under the correct repository key.
      chrome.storage.local.get(['wsStatus'], (state) => {
        const status = state.wsStatus || {};
        const repo = status.repo;
        if (!repo) return;

        _runsByRepo.set(repo, newRuns);

        // If a dashboard is actively waiting on progress, it will have
        // registered its own callback via fetchDashboardDataViaWebSocket.
        if (_progressCallbacks.has(repo)) {
          const cb = _progressCallbacks.get(repo);
          const dashboardData = convertRunsToDashboard(newRuns, repo, null);
          cb(dashboardData, false);
        }
      });
    }
    
    // Status change
    if (changes.wsStatus) {
      const status = changes.wsStatus.newValue || {};
      const repo = status.repo;
      
      if (!repo) return;

      if (status.isComplete && _pendingResolves.has(repo)) {
        chrome.storage.local.get(['wsRuns'], (result) => {
          const finalRuns = result.wsRuns || [];
          _runsByRepo.set(repo, finalRuns);
          
          const dashboardData = convertRunsToDashboard(finalRuns, repo, null);
          
          const cb = _progressCallbacks.get(repo);
          if (cb) {
            cb(dashboardData, true);
          }
          
          const resolver = _pendingResolves.get(repo);
          if (resolver) {
            resolver(dashboardData);
          }
          _pendingResolves.delete(repo);
          _pendingRejects.delete(repo);
        });
      }
      
      if (status.error && _pendingRejects.has(repo)) {
        console.error('[WebSocket] Error:', status.error);
        const rejector = _pendingRejects.get(repo);
        if (rejector) {
          rejector(new Error(status.error));
        }
        _pendingRejects.delete(repo);
        _pendingResolves.delete(repo);
      }
    }
  });
}

// ============================================
// Filter runs locally
// ============================================
export function filterRunsLocally(filters, repoOverride = null) {
  // Try explicit repo first; if not provided, fall back to the last
  // repository seen in wsStatus so filtering still works from
  // Dashboard without needing to thread the repo everywhere.
  let repo = repoOverride;
  if (!repo && typeof chrome !== 'undefined' && chrome.storage) {
    // NOTE: we cannot do async storage reads here because callers
    // expect a synchronous return, so we rely on the in-memory
    // cache, which is already keyed by repo in the storage listener.
    // If no explicit repo is provided, we take the last key in
    // _runsByRepo as the current repo.
    const keys = Array.from(_runsByRepo.keys());
    if (keys.length > 0) {
      repo = keys[keys.length - 1];
    }
  }

  if (!repo) {
    return null;
  }

  const runs = _runsByRepo.get(repo);
  if (!runs || runs.length === 0) {
    return null;
  }

  return convertRunsToDashboard(runs, repo, filters);
}

// ============================================
// Helper Functions for Data Processing
// ============================================

/**
 * Calculate basic statistics from filtered runs
 */
function calculateRunStats(filteredRuns) {
  const totalRuns = filteredRuns.length;
  const successRuns = filteredRuns.filter(r => r.conclusion === 'success').length;
  const failureRuns = filteredRuns.filter(r => r.conclusion === 'failure').length;
  const cancelledRuns = filteredRuns.filter(r => r.conclusion === 'cancelled').length;

  const successRate = totalRuns > 0 ? successRuns / totalRuns : 0;

  return { totalRuns, successRuns, failureRuns, cancelledRuns, successRate };
}

/**
 * Calculate duration statistics
 */
function calculateDurationStats(filteredRuns) {
  const durations = filteredRuns.map(r => r.duration || 0).filter(d => d > 0);
  const sortedDurations = [...durations].sort((a, b) => a - b);

  const medianDuration = sortedDurations.length > 0
    ? Math.round(sortedDurations[Math.floor(sortedDurations.length / 2)])
    : 0;

  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  let stdDeviation = 0;
  if (durations.length > 1) {
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const squaredDiffs = durations.map(d => Math.pow(d - mean, 2));
    stdDeviation = Math.round(Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / durations.length));
  }

  return { medianDuration, avgDuration, stdDeviation };
}

/**
 * Aggregate runs by date
 */
function aggregateRunsByDate(filteredRuns) {
  const runsByDate = {};

  filteredRuns.forEach(run => {
    const date = run.created_at ? run.created_at.split('T')[0] : 'Unknown';
    if (!runsByDate[date]) {
      runsByDate[date] = { successes: 0, failures: 0, cancelled: 0, durations: [] };
    }
    if (run.conclusion === 'success') runsByDate[date].successes++;
    else if (run.conclusion === 'failure') runsByDate[date].failures++;
    else if (run.conclusion === 'cancelled') runsByDate[date].cancelled++;

    if (run.duration > 0) {
      runsByDate[date].durations.push(run.duration);
    }
  });

  return Object.entries(runsByDate)
    .map(([date, stats]) => {
      const sorted = [...stats.durations].sort((a, b) => a - b);
      return {
        date,
        runs: stats.successes + stats.failures + stats.cancelled,
        successes: stats.successes,
        failures: stats.failures,
        cancelled: stats.cancelled,
        avgDuration: stats.durations.length > 0
          ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)
          : 0,
        medianDuration: sorted.length > 0 ? Math.round(sorted[Math.floor(sorted.length / 2)]) : 0,
        minDuration: sorted.length > 0 ? Math.round(sorted[0]) : 0,
        maxDuration: sorted.length > 0 ? Math.round(sorted[sorted.length - 1]) : 0
      };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Calculate branch comparison statistics
 */
function calculateBranchStats(filteredRuns) {
  const branchStats = {};

  filteredRuns.forEach(run => {
    const branch = run.branch || 'unknown';
    if (!branchStats[branch]) {
      branchStats[branch] = { totalRuns: 0, successes: 0, failures: 0, durations: [] };
    }
    branchStats[branch].totalRuns++;
    if (run.conclusion === 'success') branchStats[branch].successes++;
    else if (run.conclusion === 'failure') branchStats[branch].failures++;
    if (run.duration > 0) branchStats[branch].durations.push(run.duration);
  });

  return Object.entries(branchStats)
    .slice(0, 10)
    .map(([branch, stats]) => ({
      branch,
      workflow: 'All',
      totalRuns: stats.totalRuns,
      successRate: stats.totalRuns > 0 ? Math.round((stats.successes / stats.totalRuns) * 100) : 0,
      medianDuration: stats.durations.length > 0
        ? Math.round(stats.durations.sort((a, b) => a - b)[Math.floor(stats.durations.length / 2)])
        : 0,
      failures: stats.failures
    }));
}

/**
 * Calculate workflow statistics for boxplot and histogram
 */
function calculateWorkflowStats(filteredRuns) {
  const workflowStats = {};

  filteredRuns.forEach(run => {
    const wf = run.workflow_name || 'unknown';
    if (!workflowStats[wf]) {
      workflowStats[wf] = { totalRuns: 0, successes: 0, failures: 0, durations: [] };
    }
    workflowStats[wf].totalRuns++;
    if (run.conclusion === 'success') workflowStats[wf].successes++;
    else if (run.conclusion === 'failure') workflowStats[wf].failures++;
    if (run.duration > 0) workflowStats[wf].durations.push(run.duration);
  });

  return Object.entries(workflowStats).map(([name, stats]) => {
    const sorted = [...stats.durations].sort((a, b) => a - b);
    const q1 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.25)] : 0;
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : 0;
    const q3 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.75)] : 0;

    return {
      name,
      totalRuns: stats.totalRuns,
      successes: stats.successes,
      failures: stats.failures,
      successRate: stats.totalRuns > 0 ? Math.round((stats.successes / stats.totalRuns) * 100) : 0,
      // Data for boxplot
      min: sorted.length > 0 ? Math.round(sorted[0]) : 0,
      q1: Math.round(q1),
      median: Math.round(median),
      q3: Math.round(q3),
      max: sorted.length > 0 ? Math.round(sorted[sorted.length - 1]) : 0,
      durations: sorted.map(d => Math.round(d))
    };
  });
}

// ============================================
// Convert raw runs to Dashboard format
// ============================================
function convertRunsToDashboard(runs, repo, filters) {
  if (!runs || runs.length === 0) {
    return {
      repo,
      totalRuns: 0,
      successRate: 0,
      medianDuration: 0,
      stdDeviation: 0,
      runsOverTime: [],
      statusBreakdown: [],
      branchComparison: [],
      workflowStats: [],
      rawRuns: [],
      workflows: ['all'],
      branches: ['all'],
      actors: ['all']
    };
  }

  // Collect all unique values before filtering
  const allWorkflows = new Set();
  const allBranches = new Set();
  const allActors = new Set();
  
  runs.forEach(run => {
    if (run.workflow_name) allWorkflows.add(run.workflow_name);
    if (run.branch) allBranches.add(run.branch);
    if (run.actor) allActors.add(run.actor);
  });

  // Apply filters if provided
  let filteredRuns = runs;
  
  if (filters) {
    if (filters.workflow && !filters.workflow.includes('all')) {
      filteredRuns = filteredRuns.filter(run => filters.workflow.includes(run.workflow_name));
    }
    if (filters.branch && !filters.branch.includes('all')) {
      filteredRuns = filteredRuns.filter(run => filters.branch.includes(run.branch));
    }
    if (filters.actor && !filters.actor.includes('all')) {
      filteredRuns = filteredRuns.filter(run => filters.actor.includes(run.actor));
    }
  }

  // Calculate statistics using helper functions
  const { totalRuns, successRuns, failureRuns, cancelledRuns, successRate } = calculateRunStats(filteredRuns);
  const { medianDuration, avgDuration, stdDeviation } = calculateDurationStats(filteredRuns);

  const runsOverTime = aggregateRunsByDate(filteredRuns);
  const branchComparison = calculateBranchStats(filteredRuns);
  const workflowStats = calculateWorkflowStats(filteredRuns);

  // Status breakdown
  const statusBreakdown = [
    { name: 'success', value: successRuns },
    { name: 'failure', value: failureRuns },
    { name: 'cancelled', value: cancelledRuns }
  ];

  // Top failed jobs
  const failedRuns = filteredRuns.filter(r => r.conclusion === 'failure');
  const failedByWorkflow = {};
  failedRuns.forEach(run => {
    const wf = run.workflow_name || 'unknown';
    if (!failedByWorkflow[wf]) {
      failedByWorkflow[wf] = 0;
    }
    failedByWorkflow[wf]++;
  });
  
  const topFailedWorkflows = Object.entries(failedByWorkflow)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, failures: count }));

  // Cumulative duration of failures
  let cumulativeFailureDuration = 0;
  const failureDurationOverTime = runsOverTime.map(day => {
    const dayFailures = filteredRuns.filter(r => 
      r.created_at?.startsWith(day.date) && r.conclusion === 'failure'
    );
    const dayFailureDuration = dayFailures.reduce((sum, r) => sum + (r.duration || 0), 0);
    cumulativeFailureDuration += dayFailureDuration;
    return {
      date: day.date,
      dailyFailureDuration: Math.round(dayFailureDuration),
      cumulativeFailureDuration: Math.round(cumulativeFailureDuration)
    };
  });

  return {
    repo,
    totalRuns,
    successRate,
    failureRate: totalRuns > 0 ? failureRuns / totalRuns : 0,
    avgDuration,
    medianDuration,
    stdDeviation,
    runsOverTime,
    statusBreakdown,
    branchComparison,
    workflowStats: workflowStats,
    topFailedWorkflows,
    failureDurationOverTime,
    rawRuns: filteredRuns, // For charts that need individual data
    workflows: ['all', ...Array.from(allWorkflows).sort()],
    branches: ['all', ...Array.from(allBranches).sort()],
    actors: ['all', ...Array.from(allActors).sort()]
  };
}

// ============================================
// Public API
// ============================================

export async function fetchDashboardDataViaWebSocket(repo, filters = {}, onProgressCallback = null) {
  return new Promise((resolve, reject) => {
    // Store callbacks and promise handlers per repo so multiple
    // dashboards (for different repos) do not interfere.
    if (onProgressCallback) {
      _progressCallbacks.set(repo, onProgressCallback);
    } else {
      _progressCallbacks.delete(repo);
    }
    _pendingResolves.set(repo, resolve);
    _pendingRejects.set(repo, reject);
    _runsByRepo.set(repo, []);
    
    chrome.runtime.sendMessage({
      action: 'startWebSocketExtraction',
      repo: repo,
      filters: { start: filters.start, end: filters.end } // Seulement dates
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[WebSocket] Error:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      // If background reports that another repo is already streaming
      if (response && response.busy) {
        const message = response.error || `Another repository (${response.currentRepo}) is currently streaming. Please wait until it finishes before starting a new extraction.`;
        reject(new Error(message));
        return;
      }

      if (response?.cached) {
        const dashboardData = convertRunsToDashboard(response.data, repo, filters);
        if (onProgressCallback) {
          onProgressCallback(dashboardData, true);
        }
        resolve(dashboardData);
        _pendingResolves.delete(repo);
        _pendingRejects.delete(repo);
      } else {
        // Security timeout (3 minutes)
        setTimeout(() => {
          if (_pendingResolves.has(repo)) {
            chrome.storage.local.get(['wsRuns'], (result) => {
              const data = result.wsRuns || [];
              if (data.length > 0) {
                const dashboardData = convertRunsToDashboard(data, repo, filters);
                resolve(dashboardData);
              } else {
                if (_pendingRejects.has(repo)) {
                  reject(new Error('WebSocket timeout'));
                }
              }
              _pendingResolves.delete(repo);
              _pendingRejects.delete(repo);
            });
          }
        }, 180000);
      }
    });
  });
}

export function getWebSocketCacheStatus(repo) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'getWebSocketCacheStatus',
      repo: repo
    }, (response) => {
      resolve(response || { hasCache: false, itemCount: 0, isComplete: false });
    });
  });
}

export function clearWebSocketCache(repo = null) {
  chrome.runtime.sendMessage({
    action: 'clearWebSocketCache',
    repo: repo
  });
  chrome.storage.local.remove(['wsRuns', 'wsStatus']);
  if (repo) {
    _runsByRepo.delete(repo);
  } else {
    _runsByRepo.clear();
  }
}