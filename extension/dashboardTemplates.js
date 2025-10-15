// Dashboard HTML templates for GitHub Actions metrics

// TODO improve design
const createLoadingHTML = (repoName) => {
    return `
        <div class="dashboard">
            <p>Loading metrics for ${repoName}...</p>
        </div>
    `;
};

// TODO improve design
const createErrorHTML = (repoName, errorMessage) => {
    return `
        <div class="dashboard">
            <p>Error loading metrics for ${repoName}: ${errorMessage}</p>
        </div>
    `;
};

// TODO improve design and data
const createDashboardHTML = (repoName, data) => {
    if (!data) {
        return `<div class="dashboard"><p>No metrics data available for ${repoName}</p></div>`;
    }
    
    return `
        <div class="dashboard">
            <h3>Metrics for ${repoName}</h3>
            <p>Total Runs: ${data.totalRuns}</p>
            <p>Success Rate: ${data.successRate}%</p>
            <p>Successful: ${data.successfulRuns}</p>
            <p>Failed: ${data.failedRuns}</p>
        </div>
    `;
};

// Export for use in content script
if (typeof window !== 'undefined') {
    window.GitHubActionsTemplates = {
        createLoadingHTML,
        createErrorHTML,
        createDashboardHTML
    };
}