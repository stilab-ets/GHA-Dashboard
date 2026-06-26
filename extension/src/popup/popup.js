import browser from "webextension-polyfill";
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

    // L'URL de retour de l'extension (différente sur Chrome et Firefox)
    const redirectUri = browser.identity.getRedirectURL();

    statusSpan.textContent = "Redirection vers GitHub via le backend...";
    statusSpan.className = "status-message info";

    // On pointe vers NOTRE backend, en lui passant l'URL de l'extension 
    // pour qu'il sache où renvoyer le token à la fin.
    const authUrl = `${BACKEND_URL}/auth/login?extension_redirect_uri=${encodeURIComponent(redirectUri)}`;

    try {
      // launchWebAuthFlow va ouvrir la page, suivre les redirections, et s'arrêter
      // quand le navigateur atteindra finalement l'URL `redirectUri`
      console.log("beforeLaunch")
      const finalUrl = await browser.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
      });
      console.log("afterLaunch", finalUrl)

      if (!finalUrl) throw new Error("Aucune URL de redirection reçue.");

      // On parse l'URL finale générée par notre backend
      const urlParams = new URL(finalUrl).searchParams;
      const token = urlParams.get("token");
      const username = urlParams.get("username");
      const error = urlParams.get("error");

      if (error) throw new Error(decodeURIComponent(error));
      if (!token) throw new Error("Aucun token renvoyé par le backend.");

      // Sauvegarde et mise à jour de l'UI
      await browser.storage.session.set({
        githubToken: token,
        githubUsername: username || "Utilisateur",
      });

      await browser.storage.local.remove(["githubToken"]);
      setAuthenticatedState(true, username);

    } catch (err) {
      console.error(err);
      statusSpan.textContent = "Échec de connexion : " + err.message;
      statusSpan.className = "status-message error";
      console.log("erreurChose")
      console.error(err);
      console.error(err.message);
      console.error(err.stack);
    }
  }
});
