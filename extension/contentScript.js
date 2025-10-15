(() => {
    // === Injection forcée du script apiService.js dans le contexte de la page GitHub ===
    (function injectApiService() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('apiService.js');
        script.onload = function () {
            console.log(" apiService.js injecté dans la page GitHub");
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    })();

    let currentGitHubRepo = "";
    
    const loadModules = async () => {
        if (window.GitHubActionsUI) {
            window.GitHubActionsUI.loadDashboardCSS();
        }
    };

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log("Message received in content script:", request);

        if (request.action === "init") {
            currentGitHubRepo = request.params.repo; 
            console.log("Repo from background:", currentGitHubRepo);
            loadModules().then(() => {
                newRepoLoaded();
            });
            
            // Send response back to background script
            sendResponse({ success: true, message: "Content script initialized" });
        }
        
        return true; // Keep the message channel open for asynchronous response
    });

    const newRepoLoaded = () => {
        const dashboardBtn = window.GitHubActionsUI.createDashboardButton();
        const workflowsHeader = window.GitHubActionsUI.getWorkflowsHeader();
        
        if (workflowsHeader) {
            // Check if button already exists to avoid duplicates
            const existingButton = document.querySelector('button[title="Open GitHub Actions Dashboard"]');
            if (!existingButton) {
                workflowsHeader.appendChild(dashboardBtn);
                dashboardBtn.addEventListener("click", addNewDashboardEventHandler);
                console.log("Dashboard button successfully added to page");
            }
            return true;
        } else {
            console.error("Could not add dashboard button - workflows header not found");
            console.log("Current page URL:", window.location.href);
            console.log("Page may not be fully loaded or user may not be logged in");
            return false;
        }
    };


    const addNewDashboardEventHandler = () => {
        if (!currentGitHubRepo) {
            console.error("No repository information available.");
            return;
        }

        const existingDashboard = document.getElementById('github-actions-metrics-dashboard');
        if (existingDashboard) {
            if (existingDashboard.style.display === 'none') {
                window.GitHubActionsUI.showMetricsDashboard(existingDashboard);
            } else {
                window.GitHubActionsUI.hideMetricsDashboard(existingDashboard);
            }
        } else {
            createMetricsDashboard();
        }
    };

    const createMetricsDashboard = async () => {
        // Create the main dashboard container with loading state
        const dashboard = document.createElement('div');
        dashboard.id = 'github-actions-metrics-dashboard';
        dashboard.innerHTML = window.GitHubActionsTemplates.createLoadingHTML(currentGitHubRepo);
        
        window.GitHubActionsUI.insertDashboardIntoPage(dashboard);
        window.GitHubActionsUI.showMetricsDashboard(dashboard);
        
        await loadDashboardData(dashboard);
    };

    
    const loadDashboardData = async (dashboard) => {
    try {
        //  Attente que l’API soit bien chargée
        if (!window.GitHubActionsAPI || !window.GitHubActionsAPI.fetchMetricsData) {
            console.warn(" Attente du chargement de l'API...");
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (!window.GitHubActionsAPI) {
            throw new Error("L’API GitHubActionsAPI n’est pas disponible.");
        }

        const metricsData = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: "fetchMetrics", repo: currentGitHubRepo },
                (response) => resolve(response)
            );
        });

        console.log(" Données reçues pour affichage :", metricsData);


        dashboard.innerHTML = window.GitHubActionsTemplates.createDashboardHTML(
            currentGitHubRepo,
            metricsData
            );
        } catch (error) {
        console.error("Error loading dashboard data:", error);
        dashboard.innerHTML = window.GitHubActionsTemplates.createErrorHTML(
            currentGitHubRepo,
            error.message
            );
        }
    };

})();
