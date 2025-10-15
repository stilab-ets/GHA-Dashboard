// Function to check if the current tab is a GitHub Actions page
const isGitHubActionsPage = (url) => {
  return url && 
         url.startsWith("https://github.com/") &&
         (url.endsWith("/actions") || url.includes("/actions/"));
};

// Function to update popup content based on the current tab
const updatePopupContent = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const dashboardElement = document.getElementById("dashboard");
    if (isGitHubActionsPage(tab.url)) {
      dashboardElement.innerHTML = '<div class="message">Click the green dashboard button</div>';
    } else {
      dashboardElement.innerHTML = '<div class="message">This is not a GitHub Actions page</div>';
    }
  } catch (error) {
    console.error("Error updating popup content:", error);
    const dashboardElement = document.getElementById("dashboard");
    dashboardElement.innerHTML = '<div class="message">Error loading page information</div>';
  }
};

document.addEventListener("DOMContentLoaded", () => {
  updatePopupContent();
});
