chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openDashboardPage") {
        chrome.runtime.sendMessage({
            action: "openDashboardTab",
            params: request.params || {}
        });
        sendResponse({ success: true });
    }
});
