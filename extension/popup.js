// GitHub Token field handling
document.addEventListener("DOMContentLoaded", () => {
  const tokenInput = document.getElementById("github-token");
  const saveBtn = document.getElementById("save-token");
  const statusSpan = document.getElementById("token-status");

  // Pre-fill token if saved
  chrome.storage.local.get(["githubToken"], (result) => {
    if (result.githubToken) {
      tokenInput.value = result.githubToken;
      statusSpan.textContent = "Token loaded";
      statusSpan.className = "status-message success";
    }
  });

  saveBtn.addEventListener("click", () => {
    const token = tokenInput.value.trim();
    if (token.length > 0) {
      chrome.storage.local.set({ githubToken: token }, () => {
        statusSpan.textContent = "Token saved";
        statusSpan.className = "status-message success";
      });
    } else {
      chrome.storage.local.remove(["githubToken"], () => {
        statusSpan.textContent = "Token deleted";
        statusSpan.className = "status-message info";
      });
    }
  });
});
