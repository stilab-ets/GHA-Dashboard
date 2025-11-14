export async function fetchDashboardData(filters = {}) {
  // Replace by real fetch later TODO
  await new Promise((r) => setTimeout(r, 500));
  
  // Mock filter options (UC-02)
  const workflows = ['CI', 'Deploy', 'Tests', 'Build', 'Lint'];
  const branches = ['main', 'develop', 'feature/dashboard', 'feature/api', 'hotfix/security'];
  const actors = ['john.doe', 'jane.smith', 'bob.wilson', 'alice.cooper', 'mike.johnson'];
  
  const runsOverTime = [
    { date: '2025-10-01', runs: 2, successes: 2, failures: 0, avgDuration: 180, medianDuration: 178, minDuration: 170, maxDuration: 190 },
    { date: '2025-10-05', runs: 3, successes: 3, failures: 0, avgDuration: 190, medianDuration: 188, minDuration: 180, maxDuration: 200 },
    { date: '2025-10-10', runs: 5, successes: 4, failures: 1, avgDuration: 220, medianDuration: 215, minDuration: 190, maxDuration: 280 },
    { date: '2025-10-15', runs: 8, successes: 7, failures: 1, avgDuration: 200, medianDuration: 195, minDuration: 180, maxDuration: 240 },
    { date: '2025-10-20', runs: 10, successes: 9, failures: 1, avgDuration: 230, medianDuration: 220, minDuration: 200, maxDuration: 290 },
    { date: '2025-10-25', runs: 7, successes: 6, failures: 1, avgDuration: 210, medianDuration: 205, minDuration: 190, maxDuration: 250 },
    { date: '2025-10-30', runs: 7, successes: 6, failures: 1, avgDuration: 205, medianDuration: 200, minDuration: 185, maxDuration: 240 }
  ];

  const statusBreakdown = [
    { name: 'success', value: 86 },
    { name: 'failure', value: 10 },
    { name: 'cancelled', value: 4 }
  ];

  const topWorkflows = [
    { name: 'CI', runs: 30, success: 28, avgDuration: 200, medianDuration: 198 },
    { name: 'Deploy', runs: 12, success: 11, avgDuration: 250, medianDuration: 245 },
    { name: 'Tests', runs: 20, success: 18, avgDuration: 210, medianDuration: 207 },
    { name: 'Build', runs: 15, success: 14, avgDuration: 180, medianDuration: 178 },
    { name: 'Lint', runs: 25, success: 24, avgDuration: 90, medianDuration: 88 }
  ];

  const durationBox = [
    { name: 'CI', min: 120, q1: 160, median: 200, q3: 240, max: 320 },
    { name: 'Deploy', min: 190, q1: 220, median: 250, q3: 270, max: 330 },
    { name: 'Tests', min: 140, q1: 180, median: 210, q3: 230, max: 280 },
    { name: 'Build', min: 110, q1: 150, median: 180, q3: 200, max: 250 },
    { name: 'Lint', min: 60, q1: 75, median: 90, q3: 105, max: 140 }
  ];
  
  // UC-05: Failure rate over time
  const failureRateOverTime = [
    { date: '2025-09-01', failureRate: 8.5, avgFailureRate: 10, totalRuns: 45 },
    { date: '2025-09-08', failureRate: 12.3, avgFailureRate: 10, totalRuns: 52 },
    { date: '2025-09-15', failureRate: 15.7, avgFailureRate: 10, totalRuns: 48 },
    { date: '2025-09-22', failureRate: 18.2, avgFailureRate: 10, totalRuns: 55 },
    { date: '2025-09-29', failureRate: 9.4, avgFailureRate: 10, totalRuns: 50 },
    { date: '2025-10-06', failureRate: 7.8, avgFailureRate: 10, totalRuns: 58 },
    { date: '2025-10-13', failureRate: 11.2, avgFailureRate: 10, totalRuns: 62 },
    { date: '2025-10-20', failureRate: 13.5, avgFailureRate: 10, totalRuns: 48 },
    { date: '2025-10-27', failureRate: 8.9, avgFailureRate: 10, totalRuns: 54 },
    { date: '2025-11-03', failureRate: 6.5, avgFailureRate: 10, totalRuns: 60 },
  ];
  
  // UC-03: Branch comparison
  const branchComparison = [
    { branch: 'main', workflow: 'CI', totalRuns: 120, successRate: 92, avgDuration: 195, medianDuration: 190, failures: 10 },
    { branch: 'develop', workflow: 'CI', totalRuns: 85, successRate: 88, avgDuration: 210, medianDuration: 205, failures: 10 },
    { branch: 'feature/dashboard', workflow: 'Tests', totalRuns: 45, successRate: 82, avgDuration: 225, medianDuration: 220, failures: 8 },
    { branch: 'feature/api', workflow: 'Build', totalRuns: 32, successRate: 78, avgDuration: 240, medianDuration: 235, failures: 7 },
    { branch: 'hotfix/security', workflow: 'Deploy', totalRuns: 15, successRate: 93, avgDuration: 180, medianDuration: 175, failures: 1 }
  ];
  
  // UC-07: Spike detection with anomalies
  const spikes = [
    { date: '2025-09-01', runs: 45, failures: 4, avgDuration: 195, medianDuration: 190, anomalyScore: null, isAnomaly: false },
    { date: '2025-09-08', runs: 52, failures: 6, avgDuration: 200, medianDuration: 195, anomalyScore: null, isAnomaly: false },
    { date: '2025-09-15', runs: 48, failures: 8, avgDuration: 210, medianDuration: 205, anomalyScore: null, isAnomaly: false },
    { date: '2025-09-22', runs: 92, failures: 15, avgDuration: 285, medianDuration: 270, anomalyScore: 92, isAnomaly: true, anomalyType: 'Execution Spike', anomalyDetail: '+88% runs, +87% failures' },
    { date: '2025-09-29', runs: 50, failures: 5, avgDuration: 205, medianDuration: 200, anomalyScore: null, isAnomaly: false },
    { date: '2025-10-06', runs: 58, failures: 4, avgDuration: 198, medianDuration: 193, anomalyScore: null, isAnomaly: false },
    { date: '2025-10-13', runs: 62, failures: 18, avgDuration: 225, medianDuration: 218, anomalyScore: 62, isAnomaly: true, anomalyType: 'Failure Spike', anomalyDetail: 'Failure rate: 29% (avg: 10%)' },
    { date: '2025-10-20', runs: 48, failures: 7, avgDuration: 330, medianDuration: 315, anomalyScore: 48, isAnomaly: true, anomalyType: 'Duration Spike', anomalyDetail: 'Median duration +63% above baseline' },
    { date: '2025-10-27', runs: 54, failures: 5, avgDuration: 202, medianDuration: 198, anomalyScore: null, isAnomaly: false },
    { date: '2025-11-03', runs: 60, failures: 4, avgDuration: 195, medianDuration: 190, anomalyScore: null, isAnomaly: false },
  ];

  return {
    repo: 'stilab-ets/GHA-Dashboard',
    totalRuns: runsOverTime.reduce((s, r) => s + r.runs, 0),
    successRate: 0.86,
    failureRate: 0.10,
    avgDuration: Math.round(runsOverTime.reduce((s, r) => s + r.avgDuration * r.runs, 0) / runsOverTime.reduce((s, r) => s + r.runs, 0)),
    medianDuration: 200,
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
