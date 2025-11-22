chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openDashboardTab") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("react_page/index.html")
    });
    sendResponse({ success: true });
  }
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "UPDATE_REPO") {
    chrome.storage.local.set({ currentRepo: msg.repo });
  }
});
