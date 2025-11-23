import { fetchDashboardDataViaWebSocket } from './websocket.js';

const API_CONFIG = {
  baseUrl: 'http://localhost:3000/api',
  useWebSocket: false
};


/**
 * Extraire le repo depuis l'URL de la page GitHub actuelle
 */
function extractRepoFromCurrentPage() {
  try {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['currentRepo'], (result) => {
          if (result.currentRepo) {
            console.log(`📌 Using repo from storage: ${result.currentRepo}`);
            resolve(result.currentRepo);
          } else {
            const repo = extractRepoFromURL(window.location.href);
            console.log(`📌 Extracted repo from URL: ${repo}`);
            resolve(repo); // ❌ PAS DE DEFAULT REPO ICI
          }
        });
      } else {
        const repo = extractRepoFromURL(window.location.href);
        console.log(`📌 Extracted repo from URL (no chrome): ${repo}`);
        resolve(repo); // ❌ PAS DE DEFAULT ICI NON PLUS
      }
    });
  } catch (error) {
    console.error('Error extracting repo:', error);
    return Promise.resolve(null);
  }
}

function extractRepoFromURL(url) {
  try {
    const urlObj = new URL(url);

    // pas sur github.com → pas de repo
    if (!urlObj.hostname.includes("github.com")) return null;

    const parts = urlObj.pathname
      .split("/")
      .filter(Boolean); // retire les éléments vides

    // cas normal : github.com/owner/repo/...
    if (parts.length >= 2) {
      const owner = parts[0];
      const repo = parts[1];

      // sécurité : GitHub ajoute parfois "actions", "dashboard", etc
      // mais owner/repo restent TOUJOURS en position 0 et 1
      return `${owner}/${repo}`;
    }

    return null;
  } catch (e) {
    console.error("Error parsing URL:", e);
    return null;
  }
}


/**
 * Fonction intelligente pour trouver le bon nom de colonne
 */
function findColumnName(row, possibleNames) {
  for (const name of possibleNames) {
    if (row.hasOwnProperty(name) && row[name] !== null && row[name] !== undefined) {
      return name;
    }
  }
  return possibleNames[0];
}

/**
 * Détecte automatiquement les noms de colonnes depuis les données
 */
function detectColumnNames(sampleRow) {
  const detected = {
    workflow: findColumnName(sampleRow, ['workflow_name', 'workflowName', 'workflow', 'name']),
    branch: findColumnName(sampleRow, ['branch', 'head_branch', 'ref']),
    actor: findColumnName(sampleRow, ['issuer_name', 'actor', 'triggering_actor', 'sender', 'author']),
    created_at: findColumnName(sampleRow, ['created_at', 'createdAt', 'timestamp']),
    conclusion: findColumnName(sampleRow, ['conclusion', 'status', 'result']),
    build_duration: findColumnName(sampleRow, ['build_duration', 'buildDuration', 'duration'])
  };
  
  console.log('🔍 Auto-detected column names:', detected);
  return detected;
}

/**
 * Filtre les données extraites selon les filtres sélectionnés
 */
function filterExtractionData(data, filters, columnNames) {
  const {
    workflow: selectedWorkflows = ['all'],
    branch: selectedBranches = ['all'],
    actor: selectedActors = ['all'],
    start: startDate,
    end: endDate
  } = filters;

  return data.filter(run => {
    // Filtre workflow
    if (!selectedWorkflows.includes('all')) {
      const workflow = run[columnNames.workflow];
      if (!selectedWorkflows.includes(workflow)) return false;
    }

    // Filtre branch
    if (!selectedBranches.includes('all')) {
      const branch = run[columnNames.branch];
      if (!selectedBranches.includes(branch)) return false;
    }

    // Filtre actor
    if (!selectedActors.includes('all')) {
      const actor = run[columnNames.actor];
      if (!selectedActors.includes(actor)) return false;
    }

    // Filtre date
    if (startDate || endDate) {
      const runDate = new Date(run[columnNames.created_at]);
      if (startDate && runDate < new Date(startDate)) return false;
      if (endDate && runDate > new Date(endDate)) return false;
    }

    return true;
  });
}

/**
 * Génère les données de graphiques depuis les vraies données filtrées
 */
function generateChartsFromRealData(filteredData, columnNames) {
  if (!filteredData || filteredData.length === 0) {
    return null;
  }

  console.log(`📊 Generating charts from ${filteredData.length} filtered runs`);

  // 1. Calculs de base
  const totalRuns = filteredData.length;
  const successfulRuns = filteredData.filter(r => r[columnNames.conclusion] === 'success').length;
  const failedRuns = filteredData.filter(r => r[columnNames.conclusion] === 'failure').length;
  const cancelledRuns = filteredData.filter(r => r[columnNames.conclusion] === 'cancelled').length;
  
  const successRate = totalRuns > 0 ? successfulRuns / totalRuns : 0;
  const failureRate = totalRuns > 0 ? failedRuns / totalRuns : 0;

  // Calcul durée moyenne
  const durations = filteredData
    .map(r => parseFloat(r[columnNames.build_duration]))
    .filter(d => !isNaN(d) && d > 0);
  const avgDuration = durations.length > 0 
    ? durations.reduce((a, b) => a + b, 0) / durations.length 
    : 0;
  const medianDuration = durations.length > 0
    ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]
    : 0;

  // 2. Status breakdown
  const statusBreakdown = [
    { name: 'success', value: successfulRuns },
    { name: 'failure', value: failedRuns },
    { name: 'cancelled', value: cancelledRuns }
  ];

  // 3. Runs over time (grouper par jour)
  const runsByDate = {};
  filteredData.forEach(run => {
    const date = new Date(run[columnNames.created_at]).toISOString().split('T')[0];
    if (!runsByDate[date]) {
      runsByDate[date] = { total: 0, successes: 0, failures: 0, durations: [] };
    }
    runsByDate[date].total++;
    if (run[columnNames.conclusion] === 'success') runsByDate[date].successes++;
    if (run[columnNames.conclusion] === 'failure') runsByDate[date].failures++;
    const duration = parseFloat(run[columnNames.build_duration]);
    if (!isNaN(duration) && duration > 0) runsByDate[date].durations.push(duration);
  });

  const runsOverTime = Object.entries(runsByDate)
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .map(([date, stats]) => ({
      date,
      runs: stats.total,
      successes: stats.successes,
      failures: stats.failures,
      avgDuration: stats.durations.length > 0 
        ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)
        : 0,
      medianDuration: stats.durations.length > 0
        ? Math.round(stats.durations.sort((a, b) => a - b)[Math.floor(stats.durations.length / 2)])
        : 0
    }));

  // 4. Top workflows
  const workflowStats = {};
  filteredData.forEach(run => {
    const workflow = run[columnNames.workflow];
    if (!workflowStats[workflow]) {
      workflowStats[workflow] = { runs: 0, success: 0, durations: [] };
    }
    workflowStats[workflow].runs++;
    if (run[columnNames.conclusion] === 'success') workflowStats[workflow].success++;
    const duration = parseFloat(run[columnNames.build_duration]);
    if (!isNaN(duration) && duration > 0) workflowStats[workflow].durations.push(duration);
  });

  const topWorkflows = Object.entries(workflowStats)
    .sort(([, a], [, b]) => b.runs - a.runs)
    .slice(0, 10)
    .map(([name, stats]) => ({
      name,
      runs: stats.runs,
      success: stats.success,
      avgDuration: stats.durations.length > 0
        ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)
        : 0,
      medianDuration: stats.durations.length > 0
        ? Math.round(stats.durations.sort((a, b) => a - b)[Math.floor(stats.durations.length / 2)])
        : 0
    }));

  // 5. Duration box plot
  const durationBox = topWorkflows.map(w => {
    const durations = filteredData
      .filter(r => r[columnNames.workflow] === w.name)
      .map(r => parseFloat(r[columnNames.build_duration]))
      .filter(d => !isNaN(d) && d > 0)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return { name: w.name, min: 0, q1: 0, median: 0, q3: 0, max: 0 };
    }

    return {
      name: w.name,
      min: Math.round(durations[0]),
      q1: Math.round(durations[Math.floor(durations.length * 0.25)]),
      median: Math.round(durations[Math.floor(durations.length * 0.5)]),
      q3: Math.round(durations[Math.floor(durations.length * 0.75)]),
      max: Math.round(durations[durations.length - 1])
    };
  });

  // 6. Failure rate over time
  const avgFailureRate = failureRate * 100;
  const failureRateOverTime = runsOverTime.map(item => ({
    date: item.date,
    failureRate: item.runs > 0 ? (item.failures / item.runs) * 100 : 0,
    avgFailureRate: avgFailureRate,
    totalRuns: item.runs
  }));

  // 7. Branch comparison
  const branchStats = {};
  filteredData.forEach(run => {
    const branch = run[columnNames.branch];
    const workflow = run[columnNames.workflow];
    const key = `${branch}-${workflow}`;
    
    if (!branchStats[key]) {
      branchStats[key] = { 
        branch, 
        workflow, 
        totalRuns: 0, 
        successes: 0, 
        durations: [] 
      };
    }
    branchStats[key].totalRuns++;
    if (run[columnNames.conclusion] === 'success') branchStats[key].successes++;
    const duration = parseFloat(run[columnNames.build_duration]);
    if (!isNaN(duration) && duration > 0) branchStats[key].durations.push(duration);
  });

  const branchComparison = Object.values(branchStats)
    .sort((a, b) => b.totalRuns - a.totalRuns)
    .slice(0, 10)
    .map(stats => ({
      branch: stats.branch,
      workflow: stats.workflow,
      totalRuns: stats.totalRuns,
      successRate: stats.totalRuns > 0 ? Math.round((stats.successes / stats.totalRuns) * 100) : 0,
      avgDuration: stats.durations.length > 0
        ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)
        : 0,
      medianDuration: stats.durations.length > 0
        ? Math.round(stats.durations.sort((a, b) => a - b)[Math.floor(stats.durations.length / 2)])
        : 0,
      failures: stats.totalRuns - stats.successes
    }));

  // 8. Spike detection
  const avgRunsPerDay = runsOverTime.length > 0
    ? runsOverTime.reduce((sum, day) => sum + day.runs, 0) / runsOverTime.length
    : 0;
  const avgDurationOverTime = runsOverTime.length > 0
    ? runsOverTime.reduce((sum, day) => sum + day.avgDuration, 0) / runsOverTime.length
    : 0;

  const spikes = runsOverTime.map(item => {
    const failureRate = item.runs > 0 ? (item.failures / item.runs) * 100 : 0;
    const isFailureSpike = failureRate > avgFailureRate * 2;
    const isDurationSpike = item.avgDuration > avgDurationOverTime * 1.5;
    const isExecutionSpike = item.runs > avgRunsPerDay * 1.8;
    
    const isAnomaly = isFailureSpike || isDurationSpike || isExecutionSpike;
    let anomalyType = null;
    let anomalyDetail = null;
    
    if (isFailureSpike) {
      anomalyType = 'Failure Spike';
      anomalyDetail = `Failure rate: ${failureRate.toFixed(1)}% (avg: ${avgFailureRate.toFixed(1)}%)`;
    } else if (isDurationSpike) {
      anomalyType = 'Duration Spike';
      anomalyDetail = `Duration +${((item.avgDuration / avgDurationOverTime - 1) * 100).toFixed(0)}% above baseline`;
    } else if (isExecutionSpike) {
      anomalyType = 'Execution Spike';
      anomalyDetail = `+${((item.runs / avgRunsPerDay - 1) * 100).toFixed(0)}% runs`;
    }
    
    return {
      date: item.date,
      runs: item.runs,
      failures: item.failures,
      avgDuration: item.avgDuration,
      medianDuration: item.medianDuration,
      anomalyScore: isAnomaly ? item.runs : null,
      isAnomaly,
      anomalyType,
      anomalyDetail
    };
  });

  return {
    totalRuns,
    successRate,
    failureRate,
    avgDuration: Math.round(avgDuration),
    medianDuration: Math.round(medianDuration),
    runsOverTime,
    statusBreakdown,
    topWorkflows,
    durationBox,
    failureRateOverTime,
    branchComparison,
    spikes
  };
}

/**
 * Extrait dynamiquement les valeurs uniques depuis les données avec détection auto
 */
function extractFilterOptionsFromData(extractionData) {
  if (!extractionData || extractionData.length === 0) {
    console.warn('⚠️ No data provided for filter extraction');
    return null;
  }
  
  console.log('🔍 Extracting filter options from data...');
  console.log('📊 Total runs:', extractionData.length);
  
  const columnNames = detectColumnNames(extractionData[0]);
  
  const workflowsSet = new Set();
  const branchesSet = new Set();
  const actorsSet = new Set();
  
  extractionData.forEach(run => {
    const workflow = run[columnNames.workflow];
    if (workflow && workflow !== 'null' && workflow !== 'undefined') {
      workflowsSet.add(String(workflow));
    }
    
    const branch = run[columnNames.branch];
    if (branch && branch !== 'null' && branch !== 'undefined') {
      branchesSet.add(String(branch));
    }
    
    const actor = run[columnNames.actor];
    if (actor && actor !== 'null' && actor !== 'undefined') {
      actorsSet.add(String(actor));
    }
  });
  
  console.log('✅ Filter extraction complete:');
  console.log(`  - ${workflowsSet.size} unique workflows`);
  console.log(`  - ${branchesSet.size} unique branches`);
  console.log(`  - ${actorsSet.size} unique actors`);
  
  return {
    workflows: ['all', ...Array.from(workflowsSet).sort()],
    branches: ['all', ...Array.from(branchesSet).sort()],
    actors: ['all', ...Array.from(actorsSet).sort()],
    columnNames
  };
}

async function fetchMetrics(repo) {
  try {
    console.log(`📊 Fetching metrics for ${repo}...`);
    
    const response = await fetch(
      `${API_CONFIG.baseUrl}/github-metrics?repo=${encodeURIComponent(repo)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    console.log('✅ Metrics fetched from backend:', data);
    return data;
    
  } catch (error) {
    console.error('❌ Failed to fetch metrics from backend:', error);
    throw error;
  }
}

async function fetchFullExtractionData(repo) {
  try {
    console.log(`🔍 Fetching FULL extraction data for ${repo}...`);
    
    const response = await fetch(
      `${API_CONFIG.baseUrl}/extraction?repo=${encodeURIComponent(repo)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Extraction endpoint returned ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.success || !result.data || result.data.length === 0) {
      console.warn('⚠️ Extraction returned no data');
      return null;
    }
    
    console.log(`✅ Fetched ${result.data.length} workflow runs from backend`);
    return result.data;
    
  } catch (error) {
    console.error('❌ Failed to fetch full extraction data:', error);
    return null;
  }
}

/**
 * Fonction principale appelée par le Dashboard
 */
export async function fetchDashboardData(filters = {}) {
  try {
    const requestedRepo = await getRepoFromStorage();
    
    console.log(`📡 Loading dashboard data for: ${requestedRepo}`);
    console.log(`🔍 Applied filters:`, filters);
    
    // Récupérer les données d'extraction complètes
    const extractionData = await fetchFullExtractionData(requestedRepo);
    
    if (!extractionData || extractionData.length === 0) {
      console.warn('⚠️ No extraction data available');
      return getMockDashboardData(filters);
    }

    // Extraire les options de filtres
    const filterOptions = extractFilterOptionsFromData(extractionData);
    
    if (!filterOptions) {
      console.warn('⚠️ Could not extract filter options');
      return getMockDashboardData(filters);
    }

    // 🆕 Filtrer les données selon les filtres sélectionnés
    const filteredData = filterExtractionData(extractionData, filters, filterOptions.columnNames);
    console.log(`✅ Filtered to ${filteredData.length} runs (from ${extractionData.length} total)`);

    // 🆕 Générer les graphiques depuis les données filtrées
    const chartData = generateChartsFromRealData(filteredData, filterOptions.columnNames);
    
    if (!chartData) {
      console.warn('⚠️ No chart data generated');
      return getMockDashboardData(filters);
    }

    return {
      repo: requestedRepo,
      ...chartData,
      stdDeviation: 35,
      workflows: filterOptions.workflows,
      branches: filterOptions.branches,
      actors: filterOptions.actors
    };
    
  } catch (error) {
    console.error('❌ Error fetching from backend:', error);
    return getMockDashboardData(filters);
  }
}

function getMockDashboardData(filters = {}) {
  console.warn('⚠️ Using fallback mock data');
  
  return {
    repo: extractRepoFromURL(window.location.href),
    totalRuns: 42,
    successRate: 0.88,
    failureRate: 0.12,
    avgDuration: 205,
    medianDuration: 200,
    stdDeviation: 35,
    runsOverTime: [],
    statusBreakdown: [],
    topWorkflows: [],
    durationBox: [],
    failureRateOverTime: [],
    branchComparison: [],
    spikes: [],
    workflows: ['all'],
    branches: ['all'],
    actors: ['all']
  };
}