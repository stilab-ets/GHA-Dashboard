// Function to check if the current tab is a GitHub Actions page
const isGitHubActionsPage = (url) => {
  return url && 
         url.startsWith("https://github.com/") &&
         (url.endsWith("/actions") || url.includes("/actions/"));
};

// Function to update dashboard button state based on the current tab
const updateDashboardButtonState = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const openDashboardBtn = document.getElementById("open-dashboard");
    const hint = document.getElementById("dashboard-hint");
    if (!openDashboardBtn || !hint) return;

    if (isGitHubActionsPage(tab.url)) {
      openDashboardBtn.disabled = false;
      openDashboardBtn.style.background = "#238636";
      openDashboardBtn.style.cursor = "pointer";
      hint.textContent = "";
    } else {
      openDashboardBtn.disabled = true;
      openDashboardBtn.style.background = "#bbb";
      openDashboardBtn.style.cursor = "not-allowed";
      hint.textContent = "Go to github actions page";
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
      const reactUrl = chrome.runtime.getURL('react_page/index.html');
      const dashUrl = chrome.runtime.getURL('dashboard.html');
      try {
        // prefer react_page if it exists in the packaged extension
        const res = await fetch(reactUrl, { method: 'HEAD' });
        if (res.ok) {
          chrome.tabs.create({ url: reactUrl });
          return;
        }
      } catch (err) {
        // ignore and fallback
      }
      // fallback to dashboard.html
      chrome.tabs.create({ url: dashUrl });
    }
  });
});
