
const API_CONFIG = {
    baseUrl: 'http://localhost:5000', 
    endpoints: {
        metrics: '/metrics'
    },
    timeout: 20000 // 20 secondes (pour laisser GHAminer travailler)
};

// Fonction principale : récupérer les métriques réelles
const fetchMetricsData = async (repo) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

        const response = await fetch(
            `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.metrics}?repo=${encodeURIComponent(repo)}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Erreur API: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        console.log(" Données reçues du backend :", data);

        // Adapter les clés du backend à celles du frontend
        const normalized = {
            repo: data.repo ?? repo,
            totalRuns: data.total_runs ?? 0,
            successRate: data.success_rate ?? 0,
            successfulRuns: data.successful ?? 0,
            failedRuns: data.failed ?? 0
        };

        console.log(" Données normalisées :", normalized);
        return normalized;
    } catch (error) {
        console.error(' Échec de la récupération des métriques:', error);

        // 🧩 Valeurs de secours (mock)
        return {
            repo,
            totalRuns: 0,
            successRate: 0,
            successfulRuns: 0,
            failedRuns: 0,
            error: error.message
        };
    }
};


if (typeof window !== 'undefined') {
    window.GitHubActionsAPI = {
        fetchMetricsData
    };
}

console.log(" apiService.js chargé dans la page GitHub");
