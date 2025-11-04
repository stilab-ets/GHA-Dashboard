chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openDashboardTab") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("react_page/index.html")
    });
    sendResponse({ success: true });
  }
});