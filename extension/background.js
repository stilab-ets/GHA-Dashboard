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