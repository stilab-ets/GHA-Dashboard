const API_CONFIG = {
  baseUrl: 'http://localhost:3000/api',
  timeout: 30000 // 30s pour l'extraction
};

/**
 * Récupère le repository depuis l'URL GitHub actuelle
 */
function getCurrentRepo() {
  // Essayer de récupérer depuis chrome.storage (si on est dans le dashboard)
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['currentRepo'], (result) => {
      if (result.currentRepo) {
        resolve(result.currentRepo);
      } else {
        reject(new Error('No repository found in storage'));
      }
    });
  });
}

/**
 * Récupère le token GitHub depuis le storage
 */
function getGitHubToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['githubToken'], (result) => {
      if (result.githubToken) {
        resolve(result.githubToken);
      } else {
        reject(new Error('GitHub token not configured'));
      }
    });
  });
}

/**
 * Appelle la route d'extraction du backend Flask
 */
async function extractRepoData(repo) {
  try {
    console.log(`🔍 Extracting data for ${repo}...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    
    const response = await fetch(
      `${API_CONFIG.baseUrl}/extraction?repo=${encodeURIComponent(repo)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Extraction completed:', data);
    return data;
    
  } catch (error) {
    console.error('❌ Extraction failed:', error);
    throw error;
  }
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
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Metrics fetched:', data);
    return data;
    
  } catch (error) {
    console.error('❌ Failed to fetch metrics:', error);
    throw error;
  }
}

/**
 * Convertit les données Flask en format attendu par le Dashboard
 */
function convertFlaskDataToDashboard(flaskData) {
  // Flask retourne : { repo, totalRuns, successRate, avgDuration }
  // Dashboard attend : { repo, totalRuns, successRate, failureRate, avgDuration, 
  //                      stdDeviation, runsOverTime, statusBreakdown, topWorkflows, durationBox }
  
  const successRate = flaskData.successRate / 100; // Flask retourne un pourcentage
  const failureRate = 1 - successRate;
  
  return {
    repo: flaskData.repo,
    totalRuns: flaskData.totalRuns || 0,
    successRate: successRate,
    failureRate: failureRate,
    avgDuration: Math.round(flaskData.avgDuration || 0),
    stdDeviation: 30, // TODO: calculer depuis les données réelles
    
    // Données temporelles (TODO: enrichir avec vraies données)
    runsOverTime: generateMockTimeSeries(flaskData.totalRuns),
    
    // Breakdown des statuts
    statusBreakdown: [
      { name: 'success', value: Math.round(successRate * 100) },
      { name: 'failure', value: Math.round(failureRate * 100) },
      { name: 'cancelled', value: 0 }
    ],
    
    // Top workflows (TODO: ajouter une route Flask pour ça)
    topWorkflows: [
      { name: 'CI', runs: Math.floor(flaskData.totalRuns * 0.5), success: Math.floor(flaskData.totalRuns * 0.5 * successRate), avgDuration: flaskData.avgDuration },
      { name: 'Tests', runs: Math.floor(flaskData.totalRuns * 0.3), success: Math.floor(flaskData.totalRuns * 0.3 * successRate), avgDuration: flaskData.avgDuration * 1.1 },
      { name: 'Deploy', runs: Math.floor(flaskData.totalRuns * 0.2), success: Math.floor(flaskData.totalRuns * 0.2 * successRate), avgDuration: flaskData.avgDuration * 1.3 }
    ],
    
    // Box plot des durées (TODO: calculer depuis les données réelles)
    durationBox: [
      { 
        name: 'All workflows', 
        min: Math.round(flaskData.avgDuration * 0.6), 
        q1: Math.round(flaskData.avgDuration * 0.8), 
        median: Math.round(flaskData.avgDuration), 
        q3: Math.round(flaskData.avgDuration * 1.2), 
        max: Math.round(flaskData.avgDuration * 1.5) 
      }
    ]
  };
}

/**
 * Génère une série temporelle mock basée sur le total de runs
 */
function generateMockTimeSeries(totalRuns) {
  const days = 7;
  const runsPerDay = Math.ceil(totalRuns / days);
  const result = [];
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i - 1));
    
    result.push({
      date: date.toISOString().split('T')[0],
      runs: runsPerDay + Math.floor(Math.random() * 3),
      successes: Math.floor(runsPerDay * 0.86),
      failures: Math.floor(runsPerDay * 0.14),
      avgDuration: 180 + Math.floor(Math.random() * 50)
    });
  }
  
  return result;
}

/**
 * Fonction principale appelée par le Dashboard
 * 1. Récupère le repo actuel
 * 2. Extrait les données si nécessaire
 * 3. Récupère les métriques
 * 4. Convertit au format Dashboard
 */
export async function fetchDashboardData() {
  try {
    // 1. Récupérer le repo actuel
    const repo = await getCurrentRepo();
    console.log(`🎯 Loading dashboard for: ${repo}`);
    
    // 2. Vérifier si on a besoin d'extraire les données
    // Pour l'instant, on essaie toujours de fetch les métriques
    // Si elles n'existent pas, on lance l'extraction
    
    let flaskData;
    
    try {
      // Essayer de récupérer les métriques existantes
      flaskData = await fetchMetrics(repo);
    } catch (error) {
      console.log('⚠️ No existing data, triggering extraction...');
      
      // Si pas de données, lancer l'extraction
      await extractRepoData(repo);
      
      // Attendre un peu que les données soient écrites
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Réessayer de récupérer les métriques
      flaskData = await fetchMetrics(repo);
    }
    
    // 3. Convertir au format Dashboard
    const dashboardData = convertFlaskDataToDashboard(flaskData);
    
    console.log('✅ Dashboard data ready:', dashboardData);
    return dashboardData;
    
  } catch (error) {
    console.error('❌ Error in fetchDashboardData:', error);
    
    // En cas d'erreur, retourner des données mock pour ne pas bloquer l'UI
    console.warn('⚠️ Falling back to mock data');
    return getMockDashboardData();
  }
}

/**
 * Données mock au cas
 */
function getMockDashboardData() {
  const runsOverTime = [
    { date: '2025-10-01', runs: 2, successes: 2, failures: 0, avgDuration: 180 },
    { date: '2025-10-05', runs: 3, successes: 3, failures: 0, avgDuration: 190 },
    { date: '2025-10-10', runs: 5, successes: 4, failures: 1, avgDuration: 220 },
    { date: '2025-10-15', runs: 8, successes: 7, failures: 1, avgDuration: 200 },
    { date: '2025-10-20', runs: 10, successes: 9, failures: 1, avgDuration: 230 },
    { date: '2025-10-25', runs: 7, successes: 6, failures: 1, avgDuration: 210 },
    { date: '2025-10-30', runs: 7, successes: 6, failures: 1, avgDuration: 205 }
  ];

  const statusBreakdown = [
    { name: 'success', value: 86 },
    { name: 'failure', value: 10 },
    { name: 'cancelled', value: 4 }
  ];

  const topWorkflows = [
    { name: 'CI', runs: 30, success: 28, avgDuration: 200 },
    { name: 'Deploy', runs: 12, success: 11, avgDuration: 250 },
    { name: 'Tests', runs: 20, success: 18, avgDuration: 210 }
  ];

  const durationBox = [
    { name: 'CI', min: 120, q1: 160, median: 200, q3: 240, max: 320 },
    { name: 'Deploy', min: 190, q1: 220, median: 250, q3: 270, max: 330 },
    { name: 'Tests', min: 140, q1: 180, median: 210, q3: 230, max: 280 }
  ];

  return {
    repo: 'stilab-ets/GHA-Dashboard (mock data)',
    totalRuns: runsOverTime.reduce((s, r) => s + r.runs, 0),
    successRate: 0.86,
    failureRate: 0.10,
    avgDuration: Math.round(runsOverTime.reduce((s, r) => s + r.avgDuration * r.runs, 0) / runsOverTime.reduce((s, r) => s + r.runs, 0)),
    stdDeviation: 30,
    runsOverTime,
    statusBreakdown,
    topWorkflows,
    durationBox
  };
}