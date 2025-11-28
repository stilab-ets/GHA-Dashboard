// ============================================
// WebSocket Client
// ============================================

let _progressCallback = null;
let _currentRepo = null;
let _resolvePromise = null;
let _allRuns = []; // Stockage de tous les runs bruts

// Ecouter les changements de chrome.storage
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    
    // Changement de runs
    if (changes.wsRuns && _progressCallback && _currentRepo) {
      const newRuns = changes.wsRuns.newValue || [];
      _allRuns = newRuns;
      
      // Convertir en format dashboard (sans filtres pour l'instant)
      const dashboardData = convertRunsToDashboard(newRuns, _currentRepo, null);
      _progressCallback(dashboardData, false);
    }
    
    // Changement de statut
    if (changes.wsStatus) {
      const status = changes.wsStatus.newValue || {};
      
      if (status.isComplete && _resolvePromise) {
        chrome.storage.local.get(['wsRuns'], (result) => {
          const finalRuns = result.wsRuns || [];
          _allRuns = finalRuns;
          
          const dashboardData = convertRunsToDashboard(finalRuns, _currentRepo, null);
          
          if (_progressCallback) {
            _progressCallback(dashboardData, true);
          }
          
          if (_resolvePromise) {
            _resolvePromise(dashboardData);
            _resolvePromise = null;
          }
        });
      }
      
      if (status.error) {
        console.error('[WebSocket] Error:', status.error);
      }
    }
  });
}

// ============================================
// Filtrer les runs localement
// ============================================
export function filterRunsLocally(filters) {
  if (!_allRuns || _allRuns.length === 0) {
    return null;
  }
  
  return convertRunsToDashboard(_allRuns, _currentRepo, filters);
}

// ============================================
// Convertir les runs bruts en format Dashboard
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

  // Collecter toutes les valeurs uniques avant filtrage
  const allWorkflows = new Set();
  const allBranches = new Set();
  const allActors = new Set();
  
  runs.forEach(run => {
    if (run.workflow_name) allWorkflows.add(run.workflow_name);
    if (run.branch) allBranches.add(run.branch);
    if (run.actor) allActors.add(run.actor);
  });

  // Appliquer les filtres si fournis
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

  // Calculer les stats sur les runs filtres
  const totalRuns = filteredRuns.length;
  const successRuns = filteredRuns.filter(r => r.conclusion === 'success').length;
  const failureRuns = filteredRuns.filter(r => r.conclusion === 'failure').length;
  const cancelledRuns = filteredRuns.filter(r => r.conclusion === 'cancelled').length;
  
  const successRate = totalRuns > 0 ? successRuns / totalRuns : 0;
  
  // Calculer les durees
  const durations = filteredRuns.map(r => r.duration || 0).filter(d => d > 0);
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const medianDuration = sortedDurations.length > 0 
    ? Math.round(sortedDurations[Math.floor(sortedDurations.length / 2)])
    : 0;
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  
  // Calculer l'ecart-type
  let stdDeviation = 0;
  if (durations.length > 1) {
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const squaredDiffs = durations.map(d => Math.pow(d - mean, 2));
    stdDeviation = Math.round(Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / durations.length));
  }

  // Agreger par jour
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

  const runsOverTime = Object.entries(runsByDate)
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

  // Stats par branche
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

  const branchComparison = Object.entries(branchStats)
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

  // Stats par workflow (pour boxplot et histogramme)
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

  const workflowStatsArray = Object.entries(workflowStats).map(([name, stats]) => {
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
      // Donnees pour boxplot
      min: sorted.length > 0 ? Math.round(sorted[0]) : 0,
      q1: Math.round(q1),
      median: Math.round(median),
      q3: Math.round(q3),
      max: sorted.length > 0 ? Math.round(sorted[sorted.length - 1]) : 0,
      durations: sorted.map(d => Math.round(d))
    };
  });

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

  // Cumul des durees des echecs
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
    workflowStats: workflowStatsArray,
    topFailedWorkflows,
    failureDurationOverTime,
    rawRuns: filteredRuns, // Pour les graphiques qui ont besoin des donnees individuelles
    workflows: ['all', ...Array.from(allWorkflows).sort()],
    branches: ['all', ...Array.from(allBranches).sort()],
    actors: ['all', ...Array.from(allActors).sort()]
  };
}

// ============================================
// API Publique
// ============================================

export async function fetchDashboardDataViaWebSocket(repo, filters = {}, onProgressCallback = null) {
  return new Promise((resolve, reject) => {
    _currentRepo = repo;
    _progressCallback = onProgressCallback;
    _resolvePromise = resolve;
    _allRuns = [];
    
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
      
      if (response?.cached) {
        _allRuns = response.data;
        const dashboardData = convertRunsToDashboard(response.data, repo, filters);
        if (onProgressCallback) {
          onProgressCallback(dashboardData, true);
        }
        resolve(dashboardData);
        _resolvePromise = null;
      } else {
        // Timeout de securite (3 minutes)
        setTimeout(() => {
          if (_resolvePromise) {
            chrome.storage.local.get(['wsRuns'], (result) => {
              const data = result.wsRuns || [];
              if (data.length > 0) {
                _allRuns = data;
                const dashboardData = convertRunsToDashboard(data, repo, filters);
                resolve(dashboardData);
              } else {
                reject(new Error('WebSocket timeout'));
              }
              _resolvePromise = null;
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
  _allRuns = [];
}

// Exporter pour utilisation dans Dashboard.jsx
export function getAllRuns() {
  return _allRuns;
}

export function getCurrentRepo() {
  return _currentRepo;
}
