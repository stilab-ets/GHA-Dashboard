const API_CONFIG = {
  baseUrl: 'http://localhost:3000/api',
  defaultRepo: 'kanekidies/oxygencs-grp1-eq4' // Votre repo par défaut
};

/**
 * Récupère les métriques depuis le backend
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
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Metrics fetched:', data);
    return data;
    
  } catch (error) {
    console.error('Failed to fetch metrics:', error);
    throw error;
  }
}

/**
 * Convertit les données de l'API en format attendu par le Dashboard
 */
function convertApiDataToDashboard(apiData) {
  // API retourne: { repo, totalRuns, successfulRuns, failedRuns, successRate, avgDuration, changePercentage }
  
  const successRate = apiData.successRate / 100; // Convertir le pourcentage en décimal
  const failureRate = (apiData.failedRuns / apiData.totalRuns) || 0;
  
  return {
    repo: apiData.repo,
    totalRuns: apiData.totalRuns || 0,
    successRate: successRate,
    failureRate: failureRate,
    avgDuration: Math.round(apiData.avgDuration || 0),
    stdDeviation: 30, // TODO: calculer depuis les données réelles
    
    // Données temporelles (mock pour l'instant - TODO: ajouter une route API)
    runsOverTime: generateMockTimeSeries(apiData.totalRuns, apiData.successfulRuns),
    
    // Breakdown des statuts basé sur les vraies données
    statusBreakdown: [
      { name: 'Success', value: apiData.successfulRuns },
      { name: 'Failed', value: apiData.failedRuns },
      { name: 'Cancelled', value: 0 } // TODO: ajouter les cancelled runs dans l'API
    ],
    
    // Top workflows (mock - TODO: ajouter une route API pour obtenir ces données)
    topWorkflows: [
      { 
        name: 'CI', 
        runs: Math.floor(apiData.totalRuns * 0.5), 
        success: Math.floor(apiData.successfulRuns * 0.5), 
        avgDuration: apiData.avgDuration 
      },
      { 
        name: 'Tests', 
        runs: Math.floor(apiData.totalRuns * 0.3), 
        success: Math.floor(apiData.successfulRuns * 0.3), 
        avgDuration: apiData.avgDuration * 1.1 
      },
      { 
        name: 'Deploy', 
        runs: Math.floor(apiData.totalRuns * 0.2), 
        success: Math.floor(apiData.successfulRuns * 0.2), 
        avgDuration: apiData.avgDuration * 1.3 
      }
    ],
    
    // Box plot des durées (estimations basées sur avgDuration)
    durationBox: [
      { 
        name: 'All workflows', 
        min: Math.round(apiData.avgDuration * 0.6), 
        q1: Math.round(apiData.avgDuration * 0.8), 
        median: Math.round(apiData.avgDuration), 
        q3: Math.round(apiData.avgDuration * 1.2), 
        max: Math.round(apiData.avgDuration * 1.5) 
      }
    ]
  };
}

/**
 * Génère une série temporelle mock basée sur le total de runs
 */
function generateMockTimeSeries(totalRuns, successfulRuns) {
  const days = 7;
  const avgRunsPerDay = Math.ceil(totalRuns / days);
  const avgSuccessPerDay = Math.ceil(successfulRuns / days);
  const result = [];
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (days - i - 1));
    
    // Ajouter un peu de variation aléatoire
    const variance = Math.floor(Math.random() * 5) - 2; // -2 à +2
    const runs = Math.max(1, avgRunsPerDay + variance);
    const successes = Math.floor(runs * (successfulRuns / totalRuns));
    
    result.push({
      date: date.toISOString().split('T')[0],
      runs: runs,
      successes: successes,
      failures: runs - successes,
      avgDuration: 180 + Math.floor(Math.random() * 50)
    });
  }
  
  return result;
}

/**
 * Fonction principale appelée par le Dashboard
 */
export async function fetchDashboardData() {
  try {
    // Utiliser le repo par défaut
    const repo = API_CONFIG.defaultRepo;
    console.log(`🎯 Loading dashboard for: ${repo}`);
    
    // Récupérer les métriques depuis l'API
    const apiData = await fetchMetrics(repo);
    
    // Convertir au format Dashboard
    const dashboardData = convertApiDataToDashboard(apiData);
    
    console.log('✅ Dashboard data ready:', dashboardData);
    return dashboardData;
    
  } catch (error) {
    console.error('❌ Error in fetchDashboardData:', error);
    
    // En cas d'erreur, retourner des données mock
    console.warn('⚠️ Falling back to mock data');
    return getMockDashboardData();
  }
}

/**
 * Données mock en cas d'erreur
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
    { name: 'Success', value: 15 },
    { name: 'Failed', value: 74 },
    { name: 'Cancelled', value: 0 }
  ];

  const topWorkflows = [
    { name: 'CI', runs: 30, success: 5, avgDuration: 569 },
    { name: 'Deploy', runs: 12, success: 2, avgDuration: 620 },
    { name: 'Tests', runs: 20, success: 3, avgDuration: 510 }
  ];

  const durationBox = [
    { name: 'All workflows', min: 340, q1: 455, median: 569, q3: 683, max: 854 }
  ];

  return {
    repo: 'kanekidies/oxygencs-grp1-eq4 (mock data)',
    totalRuns: 89,
    successRate: 0.1685,
    failureRate: 0.8315,
    avgDuration: 569,
    stdDeviation: 30,
    runsOverTime,
    statusBreakdown,
    topWorkflows,
    durationBox
  };
}