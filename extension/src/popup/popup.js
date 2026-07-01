import browser from "webextension-polyfill";

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

  // Don't show token, only say if it's available or not
  (async () => {
    const result = await browser.storage.session.get([
      "githubToken",
      "githubUsername",
    ]);

    setAuthenticatedState(
      Boolean(result.githubToken),
      result.githubUsername,
    );
  })();

  authBtn.addEventListener("click", async () => {
    await loginWithGitHub();
  });

  saveBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    if (token.length > 0) {
      await browser.storage.session.set({ githubToken: token });
      await browser.storage.local.remove(["githubToken"]);
      setAuthenticatedState(true);
    } else {
      clearToken();
    }
  });

  forgetBtn.addEventListener("click", async () => {
    await clearToken();
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

  async function clearToken() {
    await browser.storage.session.remove([
      "githubToken",
      "githubUsername",
    ]);

    await browser.storage.local.remove(["githubToken"]);

    setAuthenticatedState(false);
  }

  async function loginWithGitHub() {
    const statusSpan = document.getElementById("token-status");
    statusSpan.textContent = "Redirection vers GitHub via le backend...";
    statusSpan.className = "status-message info";

    try {
      console.log("Envoi du message au background...");
      // On délègue l'action au background script
      const response = await browser.runtime.sendMessage({ action: "authenticate" });

      if (response && response.success) {
        setAuthenticatedState(true, response.username);
      } else {
        throw new Error(response?.error || "Erreur inconnue lors de l'authentification.");
      }
    } catch (err) {
      console.error(err);
      statusSpan.textContent = "Échec de connexion : " + err.message;
      statusSpan.className = "status-message error";
    }
  }
});
