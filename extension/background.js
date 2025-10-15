chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.startsWith("https://github.com/") &&
    (tab.url.endsWith("/actions") || tab.url.includes("/actions/"))
  ) {

    try {
      const pathParts = new URL(tab.url).pathname.split("/");
      if (pathParts.length < 3) {
        console.error("Invalid GitHub URL structure:", tab.url);
        return;
      }
      
      const repoFullName = `${pathParts[1]}/${pathParts[2]}`;

      // Wait for page to be fully loaded before sending message
      setTimeout(() => {
        console.log("Sending init message to content script for tab:", tabId);
        
        chrome.tabs.sendMessage(tabId, {
          action: "init",
          params: { repo: repoFullName }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error sending message to content script:", chrome.runtime.lastError.message);
            console.error("This usually means the content script is not ready or not loaded");
          } else {
            console.log("Message sent successfully to content script. Response:", response);
          }
        });
      }, 500);
    } catch (err) {
      console.error("Error processing GitHub Actions page:", err);
    }
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fetchMetrics") {
        (async () => {
            try {
                const repo = message.repo;
                const res = await fetch(`http://localhost:5000/metrics?repo=${encodeURIComponent(repo)}`);
                const data = await res.json();

                console.log(" Données reçues du backend :", data);

                if (!data || Object.keys(data).length === 0) {
                    console.warn(" Données vides reçues du backend");
                    sendResponse({
                        repo,
                        totalRuns: 0,
                        successRate: 0,
                        successfulRuns: 0,
                        failedRuns: 0
                    });
                    return;
                }

                const normalized = {
                    repo: data.repo ?? repo,
                    totalRuns: data.total_runs ?? 0,
                    successRate: data.success_rate ?? 0,
                    successfulRuns: data.successful ?? 0,
                    failedRuns: data.failed ?? 0
                };

                console.log(" Données normalisées envoyées :", normalized);
                sendResponse(normalized);
            } catch (err) {
                console.error("Erreur API backend:", err);
                sendResponse({
                    repo: message.repo,
                    totalRuns: 0,
                    successRate: 0,
                    successfulRuns: 0,
                    failedRuns: 0,
                    error: err.message
                });
            }
        })();

        return true;
    }
});
