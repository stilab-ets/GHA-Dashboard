// Function to check if the URL is a GitHub page
const isGitHubRepoPage = (url) => {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    // Check if we have at least owner/repo structure
    return pathParts.length >= 2 && urlObj.hostname === 'github.com';
  } catch (e) {
    return false;
  }
};

// Function to update dashboard button state based on the current tab
const updateDashboardButtonState = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const openDashboardBtn = document.getElementById("open-dashboard");
    const hint = document.getElementById("dashboard-hint");
    if (!openDashboardBtn || !hint) return;

    if (isGitHubRepoPage(tab.url)) {
      openDashboardBtn.disabled = false;
      openDashboardBtn.style.background = "#238636";
      openDashboardBtn.style.cursor = "pointer";
      hint.textContent = "Dashboard will appear inline on the page";
    } else {
      openDashboardBtn.disabled = true;
      openDashboardBtn.style.background = "#bbb";
      openDashboardBtn.style.cursor = "not-allowed";
      hint.textContent = "Go to a GitHub repository page";
    }
  } catch (error) {
    console.error("Error updating dashboard button state:", error);
  }
};

// GitHub Token field handling
document.addEventListener("DOMContentLoaded", () => {
  updateDashboardButtonState();

  const tokenInput = document.getElementById("github-token");
  const saveBtn = document.getElementById("save-token");
  const statusSpan = document.getElementById("token-status");
  const openDashboardBtn = document.getElementById("open-dashboard");

  // Pre-fill token if saved
  chrome.storage.local.get(["githubToken"], (result) => {
    if (result.githubToken) {
      tokenInput.value = result.githubToken;
      statusSpan.textContent = "Token loaded";
      statusSpan.style.color = "green";
    }
  });

  saveBtn.addEventListener("click", () => {
    const token = tokenInput.value.trim();
    if (token.length > 0) {
      chrome.storage.local.set({ githubToken: token }, () => {
        statusSpan.textContent = "Token saved";
        statusSpan.style.color = "green";
      });
    } else {
      chrome.storage.local.remove(["githubToken"], () => {
        statusSpan.textContent = "Token deleted";
        statusSpan.style.color = "orange";
      });
    }
  });

  // Open dashboard button handling
  openDashboardBtn.addEventListener("click", async () => {
    if (!openDashboardBtn.disabled) {
      // Send message to content script to toggle inline dashboard
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: "openDashboardPage" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Content script not ready, opening in new tab as fallback");
          // Fallback: open in new tab if content script isn't available
          const reactUrl = chrome.runtime.getURL('react_page/index.html');
          const dashUrl = chrome.runtime.getURL('dashboard.html');
          fetch(reactUrl, { method: 'HEAD' })
            .then(res => {
              if (res.ok) {
                chrome.tabs.create({ url: reactUrl });
              } else {
                chrome.tabs.create({ url: dashUrl });
              }
            })
            .catch(() => chrome.tabs.create({ url: dashUrl }));
        } else {
          window.close();
        }
      });
    }
  });
});
