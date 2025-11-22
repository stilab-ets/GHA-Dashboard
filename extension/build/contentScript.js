(function () {
  'use strict';

  /* ---------------------------------------------------------
   *  FIX 1 : always define extractRepoFromURL BEFORE usage
   * --------------------------------------------------------- */
  function extractRepoFromURL(url) {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname === 'github.com') {
        const parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
      }
    } catch (err) {
      console.error("[GHA Dashboard] URL parse error:", err);
    }
    return null;
  }

  /* ---------------------------------------------------------
   *  FIX 2 : detect repo at first load
   * --------------------------------------------------------- */
  (function detectRepoOnGitHub() {
    if (location.hostname !== "github.com") return;

    const repo = extractRepoFromURL(location.href);
    console.log("📌 [ContentScript] Detected repo:", repo);

    if (repo && chrome.runtime) {
      chrome.runtime.sendMessage({ type: "UPDATE_REPO", repo });
    }
  })();

  /* ---------------------------------------------------------
   *  Internal state
   * --------------------------------------------------------- */
  let dashboardContainer = null;
  let dashboardButton = null;
  let originalContent = null;
  let previousUrl = null;
  let isDashboardActive = false;

  /* ---------------------------------------------------------
   * helper to check repo page
   * --------------------------------------------------------- */
  const isGitHubRepoPage = () => {
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.length >= 2 && location.hostname === "github.com";
  };

  /* ---------------------------------------------------------
   * Create Dashboard Button
   * --------------------------------------------------------- */
  const injectDashboardButton = () => {
    if (document.querySelector("#gha-dashboard-nav-button")) return;

    const nav =
      document.querySelector('nav[aria-label="Repository"]') ||
      document.querySelector('.UnderlineNav-body') ||
      document.querySelector('[data-pjax-container] nav ul');

    if (!nav) {
      console.log("[GHA Dashboard] nav not found, retrying...");
      setTimeout(injectDashboardButton, 100);
      return;
    }

    const li = document.createElement("li");
    li.id = "gha-dashboard-nav-button";
    li.className = "d-flex";

    const btn = document.createElement("a");
    btn.href = "#";
    btn.className = "UnderlineNav-item";
    btn.setAttribute("role", "tab");
    btn.innerHTML = `
      <svg aria-hidden="true" height="16" width="16" viewBox="0 0 16 16" style="fill: currentColor;margin-right:4px">
        <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z"></path>
      </svg>
      Actions Dashboard
    `;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDashboard();
    });

    li.appendChild(btn);

    const ul = nav.querySelector("ul.UnderlineNav-body");

    if (ul) ul.appendChild(li);
    else nav.appendChild(li);

    dashboardButton = btn;
    console.log("[GHA Dashboard] Button injected");
  };

  /* ---------------------------------------------------------
   * Toggle Dashboard
   * --------------------------------------------------------- */
  const toggleDashboard = () => {
    if (dashboardContainer) hideDashboard();
    else showDashboard();
  };

  const showDashboard = () => {
    previousUrl = location.pathname;
    isDashboardActive = true;

    if (dashboardButton) {
      dashboardButton.classList.add("selected");
      dashboardButton.setAttribute("aria-current", "page");
    }

    createDashboard();
  };

  const hideDashboard = () => {
    isDashboardActive = false;

    if (dashboardContainer) dashboardContainer.remove();
    dashboardContainer = null;

    if (originalContent) {
      originalContent.style.display = "";
      originalContent = null;
    }

    if (dashboardButton) {
      dashboardButton.classList.remove("selected");
      dashboardButton.removeAttribute("aria-current");
    }
  };

  /* ---------------------------------------------------------
   * Create Dashboard iframe
   * --------------------------------------------------------- */
  const createDashboard = () => {
    if (!chrome.runtime || !chrome.runtime.getURL) {
      console.error("[GHA Dashboard] chrome.runtime.getURL NOT AVAILABLE");
      return;
    }

    const turboFrame = document.querySelector("turbo-frame#repo-content-turbo-frame");
    const main = document.querySelector('#js-repo-pjax-container') ||
                  document.querySelector('#repository-container-header') || 
                  document.querySelector('main') || 
                  document.body;

    if (!main) {
      console.error("[GHA Dashboard] main content not found");
      return;
    }

    originalContent = main;
    originalContent.style.display = "none";

    const container = document.createElement("div");
    container.id = 'gha-dashboard-container';
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.maxWidth = '100%';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.background = '#0d1117';

    const iframe = document.createElement("iframe");
    iframe.id = "gha-dashboard-iframe";
    iframe.style.width = '100vw';
    iframe.style.maxWidth = '100%';
    iframe.style.height = '1000px';
    iframe.style.display = 'block';
    iframe.style.border = 'none';
    iframe.style.margin = '0';
    iframe.style.padding = '0';

    iframe.src = chrome.runtime.getURL("dashboard.html");

    container.appendChild(iframe);
    main.parentNode.insertBefore(container, main.nextSibling);

    dashboardContainer = container;

    console.log("[GHA Dashboard] Dashboard created");
  };

  /* ---------------------------------------------------------
   * Observe GitHub navigation (PJAX / Turbo)
   * --------------------------------------------------------- */
  const observeNavigation = () => {
    let lastUrl = location.href;

    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log("[GHA Dashboard] Navigation detected:", lastUrl);

        const repo = extractRepoFromURL(lastUrl);
        if (repo && chrome.runtime) {
          chrome.runtime.sendMessage({ type: "UPDATE_REPO", repo });
        }

        if (dashboardContainer) hideDashboard();

        const btn = document.querySelector("#gha-dashboard-nav-button");
        if (btn) btn.remove();

        if (isGitHubRepoPage()) setTimeout(injectDashboardButton, 120);
      }
    }).observe(document.body, { subtree: true, childList: true });
  };

  /* ---------------------------------------------------------
   * Init
   * --------------------------------------------------------- */
  if (document.readyState !== "loading") injectDashboardButton();
  else document.addEventListener("DOMContentLoaded", injectDashboardButton);

  observeNavigation();
})();
