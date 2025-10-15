// UI utility functions for dashboard management

const loadDashboardCSS = () => {
    if (document.getElementById('github-actions-dashboard-css')) {
        return;
    }
    
    const link = document.createElement('link');
    link.id = 'github-actions-dashboard-css';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('dashboardStyles.css');
    document.head.appendChild(link);
};

const showMetricsDashboard = (dashboard) => {
    dashboard.style.display = 'block';
    updateButtonText(true);
};

const hideMetricsDashboard = (dashboard) => {
    dashboard.style.display = 'none';
    updateButtonText(false);
};

const updateButtonText = (showingMetrics) => {
    const button = document.querySelector('button[title="Open GitHub Actions Dashboard"]');
    if (button) {
        button.textContent = showingMetrics ? 'Hide Metrics' : 'Show Historic Metrics Dashboard';
    }
};

const createDashboardButton = () => {
    const dashboardBtn = document.createElement("button");
    dashboardBtn.textContent = "Show Historic Metrics Dashboard";
    dashboardBtn.title = "Open GitHub Actions Dashboard";
    dashboardBtn.style.cursor = "pointer";
    dashboardBtn.style.marginLeft = "8px";
    dashboardBtn.style.padding = "6px 12px";
    dashboardBtn.style.backgroundColor = "#238636";
    dashboardBtn.style.color = "white";
    dashboardBtn.style.border = "1px solid #238636";
    dashboardBtn.style.borderRadius = "6px";
    dashboardBtn.style.fontSize = "14px";
    dashboardBtn.style.fontWeight = "500";
    
    return dashboardBtn;
};

const getWorkflowsHeader = () => {
    // Try multiple selectors to handle both logged-in and logged-out states
    const selectors = [
        ".PageHeader-title.width-full",
        ".PageHeader-title",
        "h1.PageHeader-title",
        "[data-pjax-container] h1",
        ".gh-header-title"
    ];
    
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
            console.log("Found header element with selector:", selector);
            return element;
        }
    }
    
    console.error("Could not find workflows header element on page");
    return null;
};

const insertDashboardIntoPage = (dashboard) => {
    const applicationMain = document.querySelector('.application-main');
    if (applicationMain) {
        applicationMain.appendChild(dashboard);
    }
};

// Export for use in content script
if (typeof window !== 'undefined') {
    window.GitHubActionsUI = {
        loadDashboardCSS,
        showMetricsDashboard,
        hideMetricsDashboard,
        updateButtonText,
        createDashboardButton,
        getWorkflowsHeader,
        insertDashboardIntoPage
    };
}