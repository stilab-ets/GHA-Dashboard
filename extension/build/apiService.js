// API service for fetching GitHub Actions metrics
const API_CONFIG = {
    baseUrl: 'http://localhost:3000/api', // TODO change to API server URL
    endpoints: {
        metrics: '/github-metrics',
        workflowRuns: '/workflow-runs'
    },
    timeout: 10000 // TODO reduce timeout
};

const fetchMetricsData = async (repo) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
        
        const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.metrics}?repo=${encodeURIComponent(repo)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to fetch metrics data:', error);
        // TODO remove mock data
        return {
            totalRuns: 247,
            successRate: 87.2,
            successfulRuns: 215,
            failedRuns: 32,
            changePercentage: 15,
            error: error.message
        };
    }
};

// Export for use in content script
if (typeof window !== 'undefined') {
    window.GitHubActionsAPI = {
        fetchMetricsData,
        API_CONFIG
    };
}