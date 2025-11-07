// Function to check if the current tab is a GitHub Actions page
const isGitHubActionsPage = (url) => {
  return url && 
         url.startsWith("https://github.com/") &&
         (url.endsWith("/actions") || url.includes("/actions/"));
};

// Fonction helper
function extractRepoFromUrl(url) {
  if (!url || !url.includes('github.com')) {
    return null;
  }
  
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    
    if (pathParts.length >= 2) {
      return `${pathParts[0]}/${pathParts[1]}`;
    }
  } catch (error) {
    console.error('Error parsing URL:', error);
  }
  
  return null;
}

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
      try {
        // 1. Détecter et sauvegarder le repo actuel
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const repo = extractRepoFromUrl(tab.url);

        if (repo) {
          // Sauvegarder le repo dans storage
          await chrome.storage.local.set({ currentRepo: repo });
          console.log(`Saved repo for dashboard: ${repo}`);
        }

        // 2. Ouvrir le dashboard
        const reactUrl = chrome.runtime.getURL('react_page/index.html');
        const dashUrl = chrome.runtime.getURL('dashboard.html');

        try {
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

      } catch (error) {
        console.error('Error opening dashboard:', error);
        alert('Error: Could not detect repository');
      }
    }
  });
});
