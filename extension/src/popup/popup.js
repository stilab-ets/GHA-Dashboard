import { CONFIG } from "../config.js";

// GitHub Token field handling
document.addEventListener("DOMContentLoaded", () => {
  const tokenInput = document.getElementById("github-token");
  const saveBtn = document.getElementById("save-token");
  const authBtn = document.getElementById("auth-token");
  const forgetBtn = document.getElementById("forget-token");
  const manualAuthSection = document.getElementById("manual-auth-section");
  const oauthAuthSection = document.getElementById("oauth-auth-section");
  const authenticatedSection = document.getElementById("authenticated-section");
  const statusSpan = document.getElementById("token-status");
  const CLIENT_ID = CONFIG.GITHUB_CLIENT_ID;
  const BACKEND_URL = CONFIG.BACKEND_URL;

  // Don't show token, only say if it's available or not
  chrome.storage.session.get(["githubToken", "githubUsername"], (result) => {
    setAuthenticatedState(Boolean(result.githubToken), result.githubUsername);
  });

  authBtn.addEventListener("click", () => {
    loginWithGitHub();
  });

  saveBtn.addEventListener("click", () => {
    const token = tokenInput.value.trim();
    if (token.length > 0) {
      chrome.storage.session.set({ githubToken: token }, () => {
        chrome.storage.local.remove(["githubToken"]);
        setAuthenticatedState(true);
      });
    } else {
      clearToken();
    }
  });

  forgetBtn.addEventListener("click", () => {
    clearToken();
  });

  function setAuthenticatedState(isAuthenticated, username = null) {
    manualAuthSection.classList.toggle("hidden", isAuthenticated);
    oauthAuthSection.classList.toggle("hidden", isAuthenticated);
    authenticatedSection.classList.toggle("hidden", !isAuthenticated);

    if (isAuthenticated) {
      tokenInput.value = "";
      statusSpan.textContent = username
        ? `Logged in as ${username}`
        : "Token available for this browser session";
      statusSpan.className = "status-message success";
      return;
    }

    tokenInput.value = "";
    statusSpan.textContent = "No GitHub token configured";
    statusSpan.className = "status-message info";
  }

  function clearToken() {
    chrome.storage.session.remove(["githubToken", "githubUsername"], () => {
      chrome.storage.local.remove(["githubToken"]);
      setAuthenticatedState(false);
    });
  }

  function loginWithGitHub() {
    const statusSpan = document.getElementById("token-status");
    const redirectUri = chrome.identity.getRedirectURL();
    const state = crypto.randomUUID();
    chrome.storage.session.set({ oauthState: state });

    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent("repo workflow read:user")}` + 
      `&state=${encodeURIComponent(state)}`;

    chrome.identity.launchWebAuthFlow(
      {
        url,
        interactive: true,
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

          const returnedState = new URL(redirectUrl).searchParams.get("state");
          const code = new URL(redirectUrl).searchParams.get("code");

          chrome.storage.session.get(["oauthState"], async (storageResult) => {
            try {
              if (storageResult.oauthState !== returnedState) {
                statusSpan.textContent = "OAuth state mismatch";
                statusSpan.className = "status-message error";
                return;
              }

              chrome.storage.session.remove(["oauthState"]);

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
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ code }),
              });

              if (!response.ok) {
                throw new Error("Backend error: " + response.status);
              }

              const authResult = await response.json();

              if (!authResult.token) {
                statusSpan.textContent = "No token received from backend";
                statusSpan.className = "status-message error";
                return;
              }

              chrome.storage.session.set(
                {
                  githubToken: authResult.token,
                  githubUsername: authResult.username,
                },
                () => {
                  chrome.storage.local.remove(["githubToken"]);
                  setAuthenticatedState(true, authResult.username);
                },
              );
            } catch (err) {
              console.error(err);
              statusSpan.textContent = "Login failed: " + err.message;
              statusSpan.className = "status-message error";
            }
          });
        } catch (err) {
          console.error(err);
          statusSpan.textContent = "Login failed: " + err.message;
          statusSpan.className = "status-message error";
        }
      },
    );
  }
});
