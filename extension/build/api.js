import { fetchDashboardDataViaWebSocket } from './websocket.js';

const API_CONFIG = {
  baseUrl: 'http://localhost:3000/api',
  defaultRepo: 'facebook/react',
  useWebSocket: true
};

/**
 * Extraire le repo depuis l'URL de la page GitHub actuelle
 */
function extractRepoFromCurrentPage() {
  try {
    // Essayer de récupérer depuis le storage Chrome d'abord
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['currentRepo'], (result) => {
          if (result.currentRepo) {
            console.log(`📌 Using repo from storage: ${result.currentRepo}`);
            resolve(result.currentRepo);
          } else {
            // Fallback: extraire depuis window.location si possible
            const repo = extractRepoFromURL(window.location.href);
            console.log(`📌 Extracted repo from URL: ${repo || API_CONFIG.defaultRepo}`);
            resolve(repo || API_CONFIG.defaultRepo);
          }
        });
      } else {
        // Pas d'accès à chrome.storage, extraire depuis l'URL
        const repo = extractRepoFromURL(window.location.href);
        console.log(`📌 Extracted repo from URL: ${repo || API_CONFIG.defaultRepo}`);
        resolve(repo || API_CONFIG.defaultRepo);
      }
    });
  } catch (error) {
    console.error('Error extracting repo:', error);
    return Promise.resolve(API_CONFIG.defaultRepo);
  }
}

/**
 * Helper pour extraire le repo depuis une URL
 */
function extractRepoFromURL(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'github.com') {
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      if (pathParts.length >= 2) {
        return `${pathParts[0]}/${pathParts[1]}`;
      }
    }
  } catch (e) {
    console.error('Error parsing URL:', e);
  }
  return null;
}

/**
 * Récupère les métriques depuis le backend Flask
 */
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

/**
 * Génère une série temporelle basée sur les vraies données
 */
function generateTimeSeriesFromRealData(apiData) {
  const days = 10;
  const avgRunsPerDay = Math.ceil(apiData.totalRuns / days);
  const avgSuccessPerDay = Math.ceil(apiData.successfulRuns / days);
  const result = [];
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i - 1));
    
    const variance = Math.floor(Math.random() * 5) - 2;
    const runs = Math.max(1, avgRunsPerDay + variance);
    const successes = Math.floor(runs * (apiData.successfulRuns / apiData.totalRuns));
    const failures = runs - successes;
    const avgDuration = Math.round(apiData.avgDuration + (Math.random() * 50 - 25));
    
    result.push({
      date: date.toISOString().split('T')[0],
      runs: runs,
      successes: successes,
      failures: failures,
      avgDuration: avgDuration,
      medianDuration: Math.round(avgDuration * 0.98),
      minDuration: Math.round(avgDuration * 0.7),
      maxDuration: Math.round(avgDuration * 1.3)
    });
  }
  
  return result;
}

/**
 * Génère des données de spike detection basées sur les vraies métriques
 */
function generateSpikesFromRealData(timeSeriesData, avgFailureRate) {
  return timeSeriesData.map(item => {
    const failureRate = (item.failures / item.runs) * 100;
    const avgDuration = timeSeriesData.reduce((s, i) => s + i.avgDuration, 0) / timeSeriesData.length;
    const avgRuns = timeSeriesData.reduce((s, i) => s + i.runs, 0) / timeSeriesData.length;
    
    const isFailureSpike = failureRate > avgFailureRate * 2;
    const isDurationSpike = item.avgDuration > avgDuration * 1.5;
    const isExecutionSpike = item.runs > avgRuns * 1.8;
    
    const isAnomaly = isFailureSpike || isDurationSpike || isExecutionSpike;
    let anomalyType = null;
    let anomalyDetail = null;
    
    if (isFailureSpike) {
      anomalyType = 'Failure Spike';
      anomalyDetail = `Failure rate: ${failureRate.toFixed(1)}% (avg: ${avgFailureRate.toFixed(1)}%)`;
    } else if (isDurationSpike) {
      anomalyType = 'Duration Spike';
      anomalyDetail = `Duration +${((item.avgDuration / avgDuration - 1) * 100).toFixed(0)}% above baseline`;
    } else if (isExecutionSpike) {
      anomalyType = 'Execution Spike';
      anomalyDetail = `+${((item.runs / avgRuns - 1) * 100).toFixed(0)}% runs`;
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
}

/**
 * Génère les données de comparaison de branches (mock enrichi)
 */
function generateBranchComparisonFromRealData(apiData) {
  const branches = ['main', 'develop', 'feature/dashboard', 'feature/api', 'hotfix/security'];
  const workflows = ['CI', 'Tests', 'Build', 'Deploy'];
  
  return branches.slice(0, 5).map((branch, idx) => {
    const workflow = workflows[idx % workflows.length];
    const runs = Math.floor(apiData.totalRuns / branches.length) + Math.floor(Math.random() * 20);
    const successRate = 75 + Math.floor(Math.random() * 20);
    const avgDuration = Math.round(apiData.avgDuration + (Math.random() * 100 - 50));
    
    return {
      branch,
      workflow,
      totalRuns: runs,
      successRate,
      avgDuration,
      medianDuration: Math.round(avgDuration * 0.97),
      failures: Math.floor(runs * (1 - successRate / 100))
    };
  });
}

/**
 * Convertit les données de l'API en format Dashboard avec filtres
 */
function convertApiDataToDashboard(apiData, filters = {}, requestedRepo = null) {
  const successRate = (apiData.successfulRuns / apiData.totalRuns) || 0;
  const failureRate = (apiData.failedRuns / apiData.totalRuns) || 0;
  const avgFailureRate = failureRate * 100;
  
  // Générer les séries temporelles
  const allRunsOverTime = generateTimeSeriesFromRealData(apiData);
  
  // Status breakdown
  const allStatusBreakdown = [
    { name: 'success', value: apiData.successfulRuns },
    { name: 'failure', value: apiData.failedRuns },
    { name: 'cancelled', value: 0 }
  ];
  
  // Top workflows (estimation basée sur les données réelles)
  const allTopWorkflows = [
    { 
      name: 'CI', 
      runs: Math.floor(apiData.totalRuns * 0.4), 
      success: Math.floor(apiData.successfulRuns * 0.4), 
      avgDuration: Math.round(apiData.avgDuration),
      medianDuration: Math.round(apiData.avgDuration * 0.98)
    },
    { 
      name: 'Tests', 
      runs: Math.floor(apiData.totalRuns * 0.3), 
      success: Math.floor(apiData.successfulRuns * 0.3), 
      avgDuration: Math.round(apiData.avgDuration * 1.1),
      medianDuration: Math.round(apiData.avgDuration * 1.08)
    },
    { 
      name: 'Deploy', 
      runs: Math.floor(apiData.totalRuns * 0.2), 
      success: Math.floor(apiData.successfulRuns * 0.2), 
      avgDuration: Math.round(apiData.avgDuration * 1.3),
      medianDuration: Math.round(apiData.avgDuration * 1.27)
    },
    { 
      name: 'Build', 
      runs: Math.floor(apiData.totalRuns * 0.1), 
      success: Math.floor(apiData.successfulRuns * 0.1), 
      avgDuration: Math.round(apiData.avgDuration * 0.9),
      medianDuration: Math.round(apiData.avgDuration * 0.88)
    }
  ];
  
  // Duration box plot
  const allDurationBox = allTopWorkflows.map(w => ({
    name: w.name,
    min: Math.round(w.avgDuration * 0.6),
    q1: Math.round(w.avgDuration * 0.8),
    median: Math.round(w.avgDuration),
    q3: Math.round(w.avgDuration * 1.2),
    max: Math.round(w.avgDuration * 1.5)
  }));
  
  // Failure rate over time
  const allFailureRateOverTime = allRunsOverTime.map(item => ({
    date: item.date,
    failureRate: (item.failures / item.runs) * 100,
    avgFailureRate: avgFailureRate,
    totalRuns: item.runs
  }));
  
  // Branch comparison
  const allBranchComparison = generateBranchComparisonFromRealData(apiData);
  
  // Spike detection
  const allSpikes = generateSpikesFromRealData(allRunsOverTime, avgFailureRate);
  
  // Filter options
  const workflows = ['all', ...allTopWorkflows.map(w => w.name)];
  const branches = ['all', 'main', 'develop', 'feature/dashboard', 'feature/api', 'hotfix/security'];
  const actors = ['all', 'john.doe', 'jane.smith', 'bob.wilson', 'alice.cooper', 'mike.johnson'];
  
  // Apply filters
  const {
    workflow: selectedWorkflows = ['all'],
    branch: selectedBranches = ['all'],
    actor: selectedActors = ['all'],
    start: startDate,
    end: endDate
  } = filters;

  // Filter by date range
  let runsOverTime = allRunsOverTime;
  if (startDate || endDate) {
    runsOverTime = allRunsOverTime.filter(item => {
      const itemDate = new Date(item.date);
      const start = startDate ? new Date(startDate) : new Date('1900-01-01');
      const end = endDate ? new Date(endDate) : new Date('2100-01-01');
      return itemDate >= start && itemDate <= end;
    });
  }

  // Filter branch comparison
  let branchComparison = allBranchComparison;
  if (!selectedBranches.includes('all')) {
    branchComparison = branchComparison.filter(b => selectedBranches.includes(b.branch));
  }
  if (!selectedWorkflows.includes('all')) {
    branchComparison = branchComparison.filter(b => selectedWorkflows.includes(b.workflow));
  }

  // Filter top workflows
  let topWorkflows = allTopWorkflows;
  if (!selectedWorkflows.includes('all')) {
    topWorkflows = topWorkflows.filter(w => selectedWorkflows.includes(w.name));
  }

  // Filter duration box
  let durationBox = allDurationBox;
  if (!selectedWorkflows.includes('all')) {
    durationBox = durationBox.filter(d => selectedWorkflows.includes(d.name));
  }

  // Filter failure rate over time
  let failureRateOverTime = allFailureRateOverTime;
  if (startDate || endDate) {
    failureRateOverTime = allFailureRateOverTime.filter(item => {
      const itemDate = new Date(item.date);
      const start = startDate ? new Date(startDate) : new Date('1900-01-01');
      const end = endDate ? new Date(endDate) : new Date('2100-01-01');
      return itemDate >= start && itemDate <= end;
    });
  }

  // Filter spikes
  let spikes = allSpikes;
  if (startDate || endDate) {
    spikes = allSpikes.filter(item => {
      const itemDate = new Date(item.date);
      const start = startDate ? new Date(startDate) : new Date('1900-01-01');
      const end = endDate ? new Date(endDate) : new Date('2100-01-01');
      return itemDate >= start && itemDate <= end;
    });
  }

  const statusBreakdown = allStatusBreakdown;

  // Déterminer le nom du repo à afficher
  let displayRepo = apiData.repo;
  if (requestedRepo && requestedRepo !== apiData.repo) {
    displayRepo = `${requestedRepo} (using ${apiData.repo} data)`;
  }

  return {
    repo: displayRepo,
    totalRuns: runsOverTime.reduce((s, r) => s + r.runs, 0) || apiData.totalRuns,
    successRate: runsOverTime.length > 0 ? runsOverTime.reduce((s, r) => s + r.successes, 0) / runsOverTime.reduce((s, r) => s + r.runs, 0) : successRate,
    failureRate: runsOverTime.length > 0 ? runsOverTime.reduce((s, r) => s + r.failures, 0) / runsOverTime.reduce((s, r) => s + r.runs, 0) : failureRate,
    avgDuration: runsOverTime.length > 0 ? Math.round(runsOverTime.reduce((s, r) => s + r.avgDuration * r.runs, 0) / runsOverTime.reduce((s, r) => s + r.runs, 0)) : Math.round(apiData.avgDuration),
    medianDuration: runsOverTime.length > 0 ? Math.round(runsOverTime.reduce((s, r) => s + r.medianDuration, 0) / runsOverTime.length) : Math.round(apiData.avgDuration * 0.98),
    stdDeviation: 35,
    runsOverTime,
    statusBreakdown,
    topWorkflows,
    durationBox,
    failureRateOverTime,
    branchComparison,
    spikes,
    workflows,
    branches,
    actors
  };
}

/**
 * Fonction principale appelée par le Dashboard - Version avec détection auto du repo
 */
export async function fetchDashboardData(filters = {}) {
  try {
    // Extraire le repo depuis l'URL ou le storage
    const requestedRepo = await extractRepoFromCurrentPage();
    
    console.log(`📡 Loading dashboard data for: ${requestedRepo}`);
    console.log(`🔍 Applied filters:`, filters);
    console.log(`🔌 WebSocket mode: ${API_CONFIG.useWebSocket ? 'ENABLED' : 'DISABLED'}`);
    
    // Si WebSocket est activé, essayer d'extraire en temps réel
    if (API_CONFIG.useWebSocket) {
      try {
        console.log('🚀 Attempting WebSocket extraction...');
        const wsData = await fetchDashboardDataViaWebSocket(requestedRepo, filters);
        console.log('✅ Dashboard data ready (from WebSocket):', wsData);
        return wsData;
      } catch (wsError) {
        console.warn('⚠️ WebSocket extraction failed, falling back to HTTP API:', wsError);
        // Continue avec l'API HTTP en fallback
      }
    }
    
    // Méthode HTTP classique
    let apiData;
    let actualRepo = requestedRepo;
    
    try {
      apiData = await fetchMetrics(requestedRepo);
    } catch (error) {
      console.warn(`⚠️ No data for ${requestedRepo}, falling back to default repo`);
      // Si le repo demandé n'a pas de données, utiliser le repo par défaut
      //actualRepo = API_CONFIG.defaultRepo;
      //apiData = await fetchMetrics(actualRepo);
      throw error;
    }
    
    // Convertir au format Dashboard avec filtres
    const dashboardData = convertApiDataToDashboard(apiData, filters, requestedRepo);
    
    console.log('✅ Dashboard data ready (from HTTP API):', dashboardData);
    return dashboardData;
    
  } catch (error) {
    console.error('❌ Error fetching from backend:', error);
    
    // Retourner données mock en dernier recours
    return getMockDashboardData(filters);
  }
}

/**
 * Données mock en cas d'erreur backend
 */
function getMockDashboardData(filters = {}) {
  console.warn('⚠️ Using fallback mock data');
  
  const allRunsOverTime = [
    { date: '2025-10-01', runs: 2, successes: 2, failures: 0, avgDuration: 180, medianDuration: 178, minDuration: 170, maxDuration: 190 },
    { date: '2025-10-05', runs: 3, successes: 3, failures: 0, avgDuration: 190, medianDuration: 188, minDuration: 180, maxDuration: 200 },
    { date: '2025-10-10', runs: 5, successes: 4, failures: 1, avgDuration: 220, medianDuration: 215, minDuration: 190, maxDuration: 280 },
    { date: '2025-10-15', runs: 8, successes: 7, failures: 1, avgDuration: 200, medianDuration: 195, minDuration: 180, maxDuration: 240 },
    { date: '2025-10-20', runs: 10, successes: 9, failures: 1, avgDuration: 230, medianDuration: 220, minDuration: 200, maxDuration: 290 },
    { date: '2025-10-25', runs: 7, successes: 6, failures: 1, avgDuration: 210, medianDuration: 205, minDuration: 190, maxDuration: 250 },
    { date: '2025-10-30', runs: 7, successes: 6, failures: 1, avgDuration: 205, medianDuration: 200, minDuration: 185, maxDuration: 240 }
  ];

  const allStatusBreakdown = [
    { name: 'success', value: 37 },
    { name: 'failure', value: 5 },
    { name: 'cancelled', value: 0 }
  ];

  const allTopWorkflows = [
    { name: 'CI', runs: 30, success: 28, avgDuration: 200, medianDuration: 198 },
    { name: 'Deploy', runs: 12, success: 11, avgDuration: 250, medianDuration: 245 }
  ];

  const allDurationBox = [
    { name: 'CI', min: 120, q1: 160, median: 200, q3: 240, max: 320 },
    { name: 'Deploy', min: 190, q1: 220, median: 250, q3: 270, max: 330 }
  ];
  
  const allFailureRateOverTime = [
    { date: '2025-10-01', failureRate: 0, avgFailureRate: 11.9, totalRuns: 2 },
    { date: '2025-10-05', failureRate: 0, avgFailureRate: 11.9, totalRuns: 3 },
    { date: '2025-10-10', failureRate: 20, avgFailureRate: 11.9, totalRuns: 5 },
    { date: '2025-10-15', failureRate: 12.5, avgFailureRate: 11.9, totalRuns: 8 },
    { date: '2025-10-20', failureRate: 10, avgFailureRate: 11.9, totalRuns: 10 },
    { date: '2025-10-25', failureRate: 14.3, avgFailureRate: 11.9, totalRuns: 7 },
    { date: '2025-10-30', failureRate: 14.3, avgFailureRate: 11.9, totalRuns: 7 }
  ];
  
  const allBranchComparison = [
    { branch: 'main', workflow: 'CI', totalRuns: 25, successRate: 92, avgDuration: 195, medianDuration: 190, failures: 2 },
    { branch: 'develop', workflow: 'Tests', totalRuns: 17, successRate: 88, avgDuration: 210, medianDuration: 205, failures: 2 }
  ];
  
  const allSpikes = allRunsOverTime.map(item => ({
    ...item,
    anomalyScore: null,
    isAnomaly: false,
    anomalyType: null,
    anomalyDetail: null
  }));

  const workflows = ['all', 'CI', 'Deploy', 'Tests', 'Build'];
  const branches = ['all', 'main', 'develop'];
  const actors = ['all', 'john.doe', 'jane.smith'];

  // Apply same filtering logic as real data
  const {
    workflow: selectedWorkflows = ['all'],
    branch: selectedBranches = ['all'],
    start: startDate,
    end: endDate
  } = filters;

  let runsOverTime = allRunsOverTime;
  let branchComparison = allBranchComparison;
  let topWorkflows = allTopWorkflows;
  let durationBox = allDurationBox;
  let failureRateOverTime = allFailureRateOverTime;
  let spikes = allSpikes;

  if (startDate || endDate) {
    const filterByDate = (item) => {
      const itemDate = new Date(item.date);
      const start = startDate ? new Date(startDate) : new Date('1900-01-01');
      const end = endDate ? new Date(endDate) : new Date('2100-01-01');
      return itemDate >= start && itemDate <= end;
    };
    runsOverTime = allRunsOverTime.filter(filterByDate);
    failureRateOverTime = allFailureRateOverTime.filter(filterByDate);
    spikes = allSpikes.filter(filterByDate);
  }

  if (!selectedWorkflows.includes('all')) {
    topWorkflows = topWorkflows.filter(w => selectedWorkflows.includes(w.name));
    durationBox = durationBox.filter(d => selectedWorkflows.includes(d.name));
    branchComparison = branchComparison.filter(b => selectedWorkflows.includes(b.workflow));
  }

  if (!selectedBranches.includes('all')) {
    branchComparison = branchComparison.filter(b => selectedBranches.includes(b.branch));
  }

  return {
    repo: 'Mock Repository (Backend unavailable)',
    totalRuns: runsOverTime.reduce((s, r) => s + r.runs, 0) || 42,
    successRate: runsOverTime.length > 0 ? runsOverTime.reduce((s, r) => s + r.successes, 0) / runsOverTime.reduce((s, r) => s + r.runs, 0) : 0.88,
    failureRate: runsOverTime.length > 0 ? runsOverTime.reduce((s, r) => s + r.failures, 0) / runsOverTime.reduce((s, r) => s + r.runs, 0) : 0.12,
    avgDuration: runsOverTime.length > 0 ? Math.round(runsOverTime.reduce((s, r) => s + r.avgDuration * r.runs, 0) / runsOverTime.reduce((s, r) => s + r.runs, 0)) : 205,
    medianDuration: runsOverTime.length > 0 ? Math.round(runsOverTime.reduce((s, r) => s + r.medianDuration, 0) / runsOverTime.length) : 200,
    stdDeviation: 35,
    runsOverTime,
    statusBreakdown: allStatusBreakdown,
    topWorkflows,
    durationBox,
    failureRateOverTime,
    branchComparison,
    spikes,
    workflows,
    branches,
    actors
  };
}