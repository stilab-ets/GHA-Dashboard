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
const _timeoutIds = new Map();

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
        // Clear timeout since collection is complete
        if (_timeoutIds && _timeoutIds.has(repo)) {
          clearTimeout(_timeoutIds.get(repo));
          _timeoutIds.delete(repo);
        }
        
        chrome.storage.local.get(['wsRuns'], (result) => {
          const finalRuns = result.wsRuns || [];
          _runsByRepo.set(repo, finalRuns);
          
          const dashboardData = convertRunsToDashboard(finalRuns, repo, null);
          
          const cb = _progressCallbacks.get(repo);
          if (cb) {
            cb(dashboardData, true);
          }
          
          // Petite pause pour s'assurer que le callback a le temps de se déclencher
          setTimeout(() => {
            const resolver = _pendingResolves.get(repo);
            if (resolver) {
              resolver(dashboardData);
            }
            _pendingResolves.delete(repo);
            _pendingRejects.delete(repo);
            _progressCallbacks.delete(repo);
            console.log(`[WebSocket] Promise resolved for ${repo}`);
          }, 50);
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
 * Calculate duration statistics with MAD (Median Absolute Deviation)
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

  // Calculate MAD (Median Absolute Deviation) instead of std deviation
  let mad = 0;
  if (durations.length > 0 && medianDuration > 0) {
    const absoluteDeviations = durations.map(d => Math.abs(d - medianDuration));
    const sortedDeviations = [...absoluteDeviations].sort((a, b) => a - b);
    mad = sortedDeviations.length > 0
      ? Math.round(sortedDeviations[Math.floor(sortedDeviations.length / 2)])
      : 0;
  }

  return { medianDuration, avgDuration, mad };
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
 * Calculate workflow statistics with detailed metrics
 */
function calculateWorkflowStats(filteredRuns) {
  const workflowStats = {};

  filteredRuns.forEach(run => {
    const wf = run.workflow_name || 'unknown';
    if (!workflowStats[wf]) {
      workflowStats[wf] = { 
        totalRuns: 0, 
        successes: 0, 
        failures: 0, 
        skipped: 0,
        cancelled: 0,
        timeout: 0,
        durations: [] 
      };
    }
    workflowStats[wf].totalRuns++;
    if (run.conclusion === 'success') workflowStats[wf].successes++;
    else if (run.conclusion === 'failure') workflowStats[wf].failures++;
    else if (run.conclusion === 'skipped') workflowStats[wf].skipped++;
    else if (run.conclusion === 'cancelled') workflowStats[wf].cancelled++;
    else if (run.conclusion === 'timed_out') workflowStats[wf].timeout++;
    if (run.duration > 0) workflowStats[wf].durations.push(run.duration);
  });

  return Object.entries(workflowStats).map(([name, stats]) => {
    const sorted = [...stats.durations].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const totalDuration = stats.durations.reduce((a, b) => a + b, 0);

    return {
      name,
      totalRuns: stats.totalRuns,
      failures: stats.failures,
      skipped: stats.skipped,
      cancelled: stats.cancelled,
      timeout: stats.timeout,
      medianDuration: Math.round(median),
      totalDuration: Math.round(totalDuration),
      successes: stats.successes,
      successRate: stats.totalRuns > 0 ? Math.round((stats.successes / stats.totalRuns) * 100) : 0,
      // Data for boxplot
      min: sorted.length > 0 ? Math.round(sorted[0]) : 0,
      q1: sorted.length > 0 ? Math.round(sorted[Math.floor(sorted.length * 0.25)]) : 0,
      median: Math.round(median),
      q3: sorted.length > 0 ? Math.round(sorted[Math.floor(sorted.length * 0.75)]) : 0,
      max: sorted.length > 0 ? Math.round(sorted[sorted.length - 1]) : 0,
      durations: sorted.map(d => Math.round(d))
    };
  });
}

/**
 * Calculate job statistics from runs with job data
 */
function calculateJobStats(filteredRuns) {
  console.log('[WebSocket] DEBUG: calculateJobStats called', {
    totalRuns: filteredRuns.length,
    runsWithJobs: filteredRuns.filter(r => r.jobs && Array.isArray(r.jobs)).length
  });
  
  const jobStats = {};
  let totalJobsProcessed = 0;

  filteredRuns.forEach((run, idx) => {
    if (run.jobs && Array.isArray(run.jobs)) {
      if (idx < 3) {
        console.log('[WebSocket] DEBUG: Processing run with jobs', {
          runId: run.id,
          jobsCount: run.jobs.length,
          jobNames: run.jobs.map(j => j.name)
        });
      }
      
      const workflowName = run.workflow_name || 'unknown';
      
      run.jobs.forEach(job => {
        totalJobsProcessed++;
        const jobName = job.name || 'unknown';
        if (!jobStats[jobName]) {
          jobStats[jobName] = {
            totalRuns: 0,
            failures: 0,
            skipped: 0,
            cancelled: 0,
            timeout: 0,
            durations: [],
            workflows: {} // Track workflow occurrences for this job
          };
        }
        jobStats[jobName].totalRuns++;
        if (job.conclusion === 'failure') jobStats[jobName].failures++;
        else if (job.conclusion === 'skipped') jobStats[jobName].skipped++;
        else if (job.conclusion === 'cancelled') jobStats[jobName].cancelled++;
        else if (job.conclusion === 'timed_out') jobStats[jobName].timeout++;
        if (job.duration > 0) jobStats[jobName].durations.push(job.duration);
        
        // Track which workflows this job appears in
        if (!jobStats[jobName].workflows[workflowName]) {
          jobStats[jobName].workflows[workflowName] = 0;
        }
        jobStats[jobName].workflows[workflowName]++;
      });
    }
  });

  const result = Object.entries(jobStats).map(([name, stats]) => {
    const sorted = [...stats.durations].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const totalDuration = stats.durations.reduce((a, b) => a + b, 0);

    // Get the most common workflow for this job, or all workflows if multiple
    const workflows = stats.workflows || {};
    const workflowEntries = Object.entries(workflows);
    const sortedWorkflows = workflowEntries.sort((a, b) => b[1] - a[1]); // Sort by count
    const primaryWorkflow = sortedWorkflows.length > 0 ? sortedWorkflows[0][0] : 'unknown';
    // If job appears in multiple workflows, show them as comma-separated
    const allWorkflows = sortedWorkflows.map(([wf]) => wf);
    const workflowDisplay = allWorkflows.length > 1 
      ? allWorkflows.join(', ') 
      : primaryWorkflow;

    return {
      name,
      totalRuns: stats.totalRuns,
      failures: stats.failures,
      skipped: stats.skipped,
      cancelled: stats.cancelled,
      timeout: stats.timeout,
      medianDuration: Math.round(median),
      totalDuration: Math.round(totalDuration),
      workflowName: workflowDisplay,
      workflows: allWorkflows // Keep for potential future use
    };
  });
  
  console.log('[WebSocket] DEBUG: calculateJobStats result', {
    totalJobsProcessed,
    uniqueJobNames: result.length,
    jobStats: result.map(j => ({ name: j.name, totalRuns: j.totalRuns }))
  });
  
  return result;
}

/**
 * Calculate branch statistics grouped as main, fix, other
 */
function calculateBranchStatsGrouped(filteredRuns) {
  const branchGroups = {
    main: { totalRuns: 0, failures: 0, skipped: 0, cancelled: 0, timeout: 0, durations: [] },
    fix: { totalRuns: 0, failures: 0, skipped: 0, cancelled: 0, timeout: 0, durations: [] },
    other: { totalRuns: 0, failures: 0, skipped: 0, cancelled: 0, timeout: 0, durations: [] }
  };

  filteredRuns.forEach(run => {
    const branch = (run.branch || '').toLowerCase();
    let group = 'other';
    
    if (branch === 'main' || branch === 'master') {
      group = 'main';
    } else if (branch.includes('fix')) {
      group = 'fix';
    }
    
    branchGroups[group].totalRuns++;
    if (run.conclusion === 'failure') branchGroups[group].failures++;
    else if (run.conclusion === 'skipped') branchGroups[group].skipped++;
    else if (run.conclusion === 'cancelled') branchGroups[group].cancelled++;
    else if (run.conclusion === 'timed_out') branchGroups[group].timeout++;
    if (run.duration > 0) branchGroups[group].durations.push(run.duration);
  });

  return Object.entries(branchGroups).map(([name, stats]) => {
    const sorted = [...stats.durations].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const totalDuration = stats.durations.reduce((a, b) => a + b, 0);

    return {
      name,
      totalRuns: stats.totalRuns,
      failures: stats.failures,
      skipped: stats.skipped,
      cancelled: stats.cancelled,
      timeout: stats.timeout,
      medianDuration: Math.round(median),
      totalDuration: Math.round(totalDuration)
    };
  });
}

/**
 * Calculate event trigger statistics
 */
function calculateEventStats(filteredRuns) {
  const eventStats = {};

  filteredRuns.forEach(run => {
    const event = run.event || 'unknown';
    if (!eventStats[event]) {
      eventStats[event] = {
        totalRuns: 0,
        failures: 0,
        skipped: 0,
        cancelled: 0,
        timeout: 0,
        durations: []
      };
    }
    eventStats[event].totalRuns++;
    if (run.conclusion === 'failure') eventStats[event].failures++;
    else if (run.conclusion === 'skipped') eventStats[event].skipped++;
    else if (run.conclusion === 'cancelled') eventStats[event].cancelled++;
    else if (run.conclusion === 'timed_out') eventStats[event].timeout++;
    if (run.duration > 0) eventStats[event].durations.push(run.duration);
  });

  return Object.entries(eventStats).map(([name, stats]) => {
    const sorted = [...stats.durations].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const totalDuration = stats.durations.reduce((a, b) => a + b, 0);

    return {
      name,
      totalRuns: stats.totalRuns,
      failures: stats.failures,
      skipped: stats.skipped,
      cancelled: stats.cancelled,
      timeout: stats.timeout,
      medianDuration: Math.round(median),
      totalDuration: Math.round(totalDuration)
    };
  });
}

/**
 * Calculate contributor (actor) statistics
 */
function calculateContributorStats(filteredRuns) {
  const contributorStats = {};

  filteredRuns.forEach(run => {
    const actor = run.actor || 'unknown';
    if (!contributorStats[actor]) {
      contributorStats[actor] = {
        totalRuns: 0,
        failures: 0,
        skipped: 0,
        cancelled: 0,
        timeout: 0,
        durations: []
      };
    }
    contributorStats[actor].totalRuns++;
    if (run.conclusion === 'failure') contributorStats[actor].failures++;
    else if (run.conclusion === 'skipped') contributorStats[actor].skipped++;
    else if (run.conclusion === 'cancelled') contributorStats[actor].cancelled++;
    else if (run.conclusion === 'timed_out') contributorStats[actor].timeout++;
    if (run.duration > 0) contributorStats[actor].durations.push(run.duration);
  });

  return Object.entries(contributorStats).map(([name, stats]) => {
    const sorted = [...stats.durations].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const totalDuration = stats.durations.reduce((a, b) => a + b, 0);
    const successCount = stats.totalRuns - stats.failures - stats.skipped - stats.cancelled - stats.timeout;
    const successRate = stats.totalRuns > 0 ? (successCount / stats.totalRuns) * 100 : 0;
    const failureRate = stats.totalRuns > 0 ? (stats.failures / stats.totalRuns) * 100 : 0;

    return {
      name,
      totalRuns: stats.totalRuns,
      failures: stats.failures,
      skipped: stats.skipped,
      cancelled: stats.cancelled,
      timeout: stats.timeout,
      successes: successCount,
      successRate: Math.round(successRate),
      failureRate: Math.round(failureRate),
      medianDuration: Math.round(median),
      totalDuration: Math.round(totalDuration)
    };
  });
}

/**
 * Calculate time to fix per workflow
 * Groups by workflow_id + branch + pull_request_number, finds failure→success sequences
 */
function calculateTimeToFix(filteredRuns) {
  // Group runs by workflow only (not by branch/PR to get more data points)
  const groups = {};
  
  filteredRuns.forEach(run => {
    // Use workflow_name as the grouping key
    const workflowName = run.workflow_name || 'unknown';
    
    if (!groups[workflowName]) {
      groups[workflowName] = {
        workflow_name: workflowName,
        runs: []
      };
    }
    groups[workflowName].runs.push(run);
  });

  // Calculate time-to-fix for each group
  const timeToFixByWorkflow = {};
  const allTimeToFix = []; // For aggregated "All Workflows" box
  
  Object.values(groups).forEach(group => {
    // Sort runs by created_at (oldest first)
    const sortedRuns = [...group.runs].sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateA - dateB;
    });

    // Find failure→success sequences
    // Look for any failure followed by any success (not just consecutive)
    for (let i = 0; i < sortedRuns.length; i++) {
      const currentRun = sortedRuns[i];
      
      // Check for failure (handle different conclusion values)
      const isFailure = currentRun.conclusion === 'failure' || 
                       currentRun.conclusion === 'failed' ||
                       (currentRun.status === 'completed' && currentRun.conclusion !== 'success' && currentRun.conclusion !== 'skipped' && currentRun.conclusion !== 'cancelled');
      
      if (isFailure) {
        // Find the next success after this failure
        for (let j = i + 1; j < sortedRuns.length; j++) {
          const nextRun = sortedRuns[j];
          
          // Check for success
          const isSuccess = nextRun.conclusion === 'success' || 
                           (nextRun.status === 'completed' && nextRun.conclusion === 'success');
          
          if (isSuccess) {
            const failureTime = new Date(currentRun.created_at);
            const successTime = new Date(nextRun.created_at);
            const timeToFix = (successTime - failureTime) / 1000; // Convert to seconds
            
            // Only count reasonable time-to-fix values (positive and less than 30 days)
            if (timeToFix > 0 && timeToFix < 30 * 24 * 60 * 60) {
              const workflowName = group.workflow_name || 'unknown';
              if (!timeToFixByWorkflow[workflowName]) {
                timeToFixByWorkflow[workflowName] = [];
              }
              timeToFixByWorkflow[workflowName].push(timeToFix);
              allTimeToFix.push(timeToFix);
              
              // Only count the first success after a failure
              break;
            }
          }
        }
      }
    }
  });

  // Convert to array format for box plot
  const workflowBoxes = Object.entries(timeToFixByWorkflow)
    .filter(([_, times]) => times.length > 0) // Only include workflows with time-to-fix data
    .map(([workflowName, times]) => {
      const sorted = [...times].sort((a, b) => a - b);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      return {
        workflow: workflowName,
        times: sorted,
        count: sorted.length,
        min: sorted.length > 0 ? Math.round(sorted[0]) : 0,
        q1: sorted.length > 0 ? Math.round(sorted[Math.floor(sorted.length * 0.25)]) : 0,
        median: sorted.length > 0 ? Math.round(sorted[Math.floor(sorted.length / 2)]) : 0,
        q3: sorted.length > 0 ? Math.round(sorted[Math.floor(sorted.length * 0.75)]) : 0,
        max: sorted.length > 0 ? Math.round(sorted[sorted.length - 1]) : 0,
        mean: Math.round(mean)
      };
    });

  // Add aggregated "All Workflows" box if we have multiple workflows
  if (allTimeToFix.length > 0 && workflowBoxes.length > 1) {
    const sortedAll = [...allTimeToFix].sort((a, b) => a - b);
    const meanAll = allTimeToFix.reduce((a, b) => a + b, 0) / allTimeToFix.length;
    workflowBoxes.push({
      workflow: 'All Workflows',
      times: sortedAll,
      count: sortedAll.length,
      min: sortedAll.length > 0 ? Math.round(sortedAll[0]) : 0,
      q1: sortedAll.length > 0 ? Math.round(sortedAll[Math.floor(sortedAll.length * 0.25)]) : 0,
      median: sortedAll.length > 0 ? Math.round(sortedAll[Math.floor(sortedAll.length / 2)]) : 0,
      q3: sortedAll.length > 0 ? Math.round(sortedAll[Math.floor(sortedAll.length * 0.75)]) : 0,
      max: sortedAll.length > 0 ? Math.round(sortedAll[sortedAll.length - 1]) : 0,
      mean: Math.round(meanAll)
    });
  }

  return workflowBoxes;
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
      mad: 0,
      runsOverTime: [],
      statusBreakdown: [],
      branchComparison: [],
      workflowStats: [],
      jobStats: [],
      branchStatsGrouped: [],
      eventStats: [],
      timeToFix: [],
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

  // Apply filters if provided (workflow, branch, actor, and date)
  let filteredRuns = runs;
  
  // Store original total runs count (before any filtering) for the "Total runs" KPI
  const originalTotalRuns = runs.length;
  
  if (filters) {
    // Filter by workflow
    if (filters.workflow && !filters.workflow.includes('all')) {
      filteredRuns = filteredRuns.filter(run => filters.workflow.includes(run.workflow_name));
    }
    // Filter by branch
    if (filters.branch && !filters.branch.includes('all')) {
      filteredRuns = filteredRuns.filter(run => filters.branch.includes(run.branch));
    }
    // Filter by actor
    if (filters.actor && !filters.actor.includes('all')) {
      filteredRuns = filteredRuns.filter(run => filters.actor.includes(run.actor));
    }
    // Filter by date range (client-side)
    if (filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999); // Include entire end date
      
      filteredRuns = filteredRuns.filter(run => {
        if (!run.created_at) return false;
        const runDate = new Date(run.created_at);
        return runDate >= startDate && runDate <= endDate;
      });
    }
  }

  // Filter out runs with duration > 30 million seconds (347 days) for charts/stats
  // But keep them in the original total count for the "Total runs" KPI
  const MAX_DURATION_SECONDS = 30000000;
  const runsForStats = filteredRuns.filter(run => {
    const duration = run.duration || 0;
    return duration <= MAX_DURATION_SECONDS;
  });

  // Calculate statistics using helper functions (using filtered runs without long durations)
  const { totalRuns, successRuns, failureRuns, cancelledRuns, successRate } = calculateRunStats(runsForStats);
  const { medianDuration, avgDuration, mad } = calculateDurationStats(runsForStats);

  const runsOverTime = aggregateRunsByDate(runsForStats);
  const branchComparison = calculateBranchStats(runsForStats);
  const workflowStats = calculateWorkflowStats(runsForStats);
  const jobStats = calculateJobStats(runsForStats);
  const branchStatsGrouped = calculateBranchStatsGrouped(runsForStats);
  const eventStats = calculateEventStats(runsForStats);
  const contributorStats = calculateContributorStats(runsForStats);
  const timeToFix = calculateTimeToFix(runsForStats);

  // Status breakdown
  const statusBreakdown = [
    { name: 'success', value: successRuns },
    { name: 'failure', value: failureRuns },
    { name: 'cancelled', value: cancelledRuns }
  ];

  // Top failed jobs
  const failedRuns = runsForStats.filter(r => r.conclusion === 'failure');
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
    const dayFailures = runsForStats.filter(r => 
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
    totalRuns, // Filtered count (without long-duration runs) for stats
    originalTotalRuns: originalTotalRuns, // Original total count including long-duration runs for "Total runs" KPI
    successRate,
    failureRate: totalRuns > 0 ? failureRuns / totalRuns : 0,
    avgDuration,
    medianDuration,
    mad, // Median Absolute Deviation instead of stdDeviation
    runsOverTime,
    statusBreakdown,
    branchComparison,
    workflowStats: workflowStats,
    jobStats: jobStats,
    branchStatsGrouped: branchStatsGrouped,
    eventStats: eventStats,
    contributorStats: contributorStats,
    timeToFix: timeToFix,
    topFailedWorkflows,
    failureDurationOverTime,
    rawRuns: runsForStats, // For charts that need individual data (filtered out long durations)
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
        // Extended timeout for GHAminer collection (30 minutes)
        // GHAminer can take a long time for large repositories
        const timeoutId = setTimeout(() => {
          if (_pendingResolves.has(repo)) {
            chrome.storage.local.get(['wsRuns', 'wsStatus'], (result) => {
              const data = result.wsRuns || [];
              const status = result.wsStatus || {};
              
              // Only timeout if collection is complete
              if (status.isComplete) {
                if (data.length > 0) {
                  const dashboardData = convertRunsToDashboard(data, repo, filters);
                  resolve(dashboardData);
                } else {
                  // Collection completed but no data
                  const dashboardData = convertRunsToDashboard([], repo, filters);
                  resolve(dashboardData);
                }
                _pendingResolves.delete(repo);
                _pendingRejects.delete(repo);
              } else {
                // Still collecting, don't timeout yet
                console.log('[WebSocket] Collection still in progress, not timing out yet...');
                // Keep the timeout active, it will be cleared when complete
              }
            });
          }
        }, 1800000); // 30 minutes
        
        // Store timeout ID so we can clear it on completion
        if (!_timeoutIds) _timeoutIds = new Map();
        _timeoutIds.set(repo, timeoutId);
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