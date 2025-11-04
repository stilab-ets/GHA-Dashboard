export async function fetchDashboardData() {
  // Replace by real fetch later TODO
  await new Promise((r) => setTimeout(r, 500));
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
    repo: 'stilab-ets/GHA-Dashboard',
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
