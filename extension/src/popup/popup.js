import { CONFIG } from "../config.js";

// GitHub Token field handling
document.addEventListener("DOMContentLoaded", () => {
  const tokenInput = document.getElementById("github-token");
  const saveBtn = document.getElementById("save-token");
  const authBtn = document.getElementById("auth-token");
  const statusSpan = document.getElementById("token-status");
  const CLIENT_ID = CONFIG.GITHUB_CLIENT_ID;
  const BACKEND_URL = CONFIG.BACKEND_URL;

  // Pre-fill token if saved
  chrome.storage.local.get(["githubToken", "githubUsername"], (result) => {
    if (result.githubToken) {
      tokenInput.value = result.githubToken;
      statusSpan.textContent = `Logged in as ${result.githubUsername}`;
      statusSpan.className = "status-message success";
    }
  });

  authBtn.addEventListener("click", () => {
    loginWithGitHub();
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

  function loginWithGitHub() {
    const statusSpan = document.getElementById("token-status");

    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${CLIENT_ID}` +
      `&scope=repo,workflow,read:user`;

    chrome.identity.launchWebAuthFlow(
      {
        url,
        interactive: true
      },
      async (redirectUrl) => {
        try {
          if (chrome.runtime.lastError) {

            statusSpan.textContent = "OAuth failed";
            statusSpan.className = "status-message error";
            return;
          }

          if (!redirectUrl) {
            statusSpan.textContent = "No redirect URL received";
            statusSpan.className = "status-message error";
            return;
          }

          const code = new URL(redirectUrl).searchParams.get("code");

          if (!code) {
            statusSpan.textContent = "No authorization code found";
            statusSpan.className = "status-message error";
            return;
          }

          statusSpan.textContent = "Exchanging code...";
          statusSpan.className = "status-message info";

          const response = await fetch(`${BACKEND_URL}/auth/github`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ code })
          });

          if (!response.ok) {
            throw new Error("Backend error: " + response.status);
          }

          const result = await response.json();

          if (!result.token) {
            statusSpan.textContent = "Invalid backend response";
            statusSpan.className = "status-message error";
            return;
          }

          chrome.storage.local.set({
            githubToken: result.token,
            githubUsername: result.username
          }, () => {
            statusSpan.textContent = `Logged in as ${result.username}`;
            statusSpan.className = "status-message success";
          });

        } catch (err) {
          console.error(err);
          statusSpan.textContent = "Login failed: " + err.message;
          statusSpan.className = "status-message error";
        }
      }
    );
  }
});
