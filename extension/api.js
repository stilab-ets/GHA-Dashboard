import { GitHubActionsAPI } from './apiService.js';

export async function fetchDashboardData() {
  try {
    const repo = 'stilab-ets/GHA-Dashboard'; // ou récupéré dynamiquement
    const data = await GitHubActionsAPI.fetchMetricsData(repo);
    return data;
  } catch (err) {
    console.error("Erreur récupération données Flask:", err);
    return {}; // fallback si erreur
  }
}
