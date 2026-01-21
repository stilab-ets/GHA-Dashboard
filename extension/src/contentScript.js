(function () {
  'use strict';

  /* ---------------------------------------------------------
   * FIX 1: Always define extractRepoFromURL before usage
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
   * FIX 2: Detect repo at first load
   * --------------------------------------------------------- */
  (function detectRepoOnGitHub() {
    if (location.hostname !== "github.com") return;

    const repo = extractRepoFromURL(location.href);
    console.log(" [ContentScript] Detected repo:", repo);

    if (repo && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({ type: "UPDATE_REPO", repo });
      } catch (e) {
        console.error("[GHA Dashboard] Extension context invalidated:", e);
        window.location.reload();
      }
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
   * Helper to check repo page
   * --------------------------------------------------------- */
  const isGitHubRepoPage = () => {
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.length >= 2 && location.hostname === "github.com";
  };

  /* ---------------------------------------------------------
   * Create Dashboard Button
   * --------------------------------------------------------- */
  let injectRetryCount = 0;
  const MAX_INJECT_RETRIES = 20; // Try for up to 2 seconds (20 * 100ms)
  
  const injectDashboardButton = () => {
    // Don't inject if already exists
    if (document.querySelector("#gha-dashboard-nav-button")) {
      injectRetryCount = 0; // Reset counter on success
      return;
    }

    // Try multiple selectors to find the navigation container
    const nav =
      document.querySelector('nav[aria-label="Repository"]') ||
      document.querySelector('.UnderlineNav-body') ||
      document.querySelector('[data-pjax-container] nav ul') ||
      document.querySelector('nav.UnderlineNav ul.UnderlineNav-body');

    if (!nav) {
      injectRetryCount++;
      if (injectRetryCount < MAX_INJECT_RETRIES) {
        console.log(`[GHA Dashboard] Navigation bar not found, retrying... (${injectRetryCount}/${MAX_INJECT_RETRIES})`);
        setTimeout(injectDashboardButton, 100);
        return;
      } else {
        console.log('[GHA Dashboard] Navigation bar not found after max retries, will observe DOM for it');
        injectRetryCount = 0;
        // Set up a MutationObserver to watch for navigation bar
        observeForNavigationBar();
        return;
      }
    }

    // Reset retry count on success
    injectRetryCount = 0;

    // Find the nav list - try multiple approaches
    let navList = nav.querySelector('ul.UnderlineNav-body');
    if (!navList) {
      navList = nav.querySelector('ul');
    }
    if (!navList && nav.tagName === 'UL') {
      navList = nav;
    }

    if (!navList) {
      console.log('[GHA Dashboard] Navigation list not found, retrying...');
      setTimeout(injectDashboardButton, 100);
      return;
    }

    const navItem = document.createElement('li');
    navItem.id = 'gha-dashboard-nav-button';
    navItem.className = 'd-flex';

    const button = document.createElement('a');
    button.href = '#';
    button.className = 'UnderlineNav-item';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.innerHTML = `
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" style="fill: currentColor; margin-right: 4px;">
        <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"></path>
      </svg>
      Actions Dashboard
    `;
    button.style.cssText = 'cursor: pointer; text-decoration: none;';
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      toggleDashboard();
    });

    navItem.appendChild(button);
    navList.appendChild(navItem);
    
    dashboardButton = button;

    // Add listeners to other nav items to close dashboard when clicked
    const allNavItems = nav.querySelectorAll('.UnderlineNav-item:not(#gha-dashboard-nav-button .UnderlineNav-item)');
    allNavItems.forEach(item => {
      item.addEventListener('click', (e) => {
        if (dashboardContainer && isDashboardActive) {
          // Check if clicking the same URL we were on before dashboard
          const clickedUrl = item.getAttribute('href');
          if (clickedUrl && previousUrl && clickedUrl === previousUrl) {
            // Same section - force page reload to avoid issues
            e.preventDefault();
            console.log('[GHA Dashboard] Reloading page to avoid state issues');
            window.location.reload();
            return;
          }
          hideDashboard();
        }
      });
    });

    console.log('[GHA Dashboard] Button injected into navigation bar');
  };

  /* ---------------------------------------------------------
   * Observe DOM for navigation bar to appear and persist
   * --------------------------------------------------------- */
  let navigationObserver = null;
  const observeForNavigationBar = () => {
    // Disconnect existing observer if any
    if (navigationObserver) {
      navigationObserver.disconnect();
      navigationObserver = null;
    }

    navigationObserver = new MutationObserver((mutations) => {
      // Check if navigation bar exists but button is missing
      const nav = document.querySelector('nav[aria-label="Repository"]') ||
                  document.querySelector('.UnderlineNav-body') ||
                  document.querySelector('[data-pjax-container] nav ul') ||
                  document.querySelector('nav.UnderlineNav ul.UnderlineNav-body');
      
      const existingButton = document.querySelector("#gha-dashboard-nav-button");
      
      // If navigation exists but button doesn't, inject it
      if (nav && !existingButton) {
        console.log('[GHA Dashboard] Navigation bar detected, injecting button');
        injectDashboardButton();
      }
      
      // Check if navigation was replaced (button exists but is orphaned or nav was replaced)
      if (existingButton) {
        let buttonInNav = false;
        if (nav) {
          buttonInNav = nav.contains(existingButton);
        }
        
        // If button is orphaned or nav doesn't exist, re-inject
        if (!buttonInNav) {
          console.log('[GHA Dashboard] Navigation bar was replaced or button orphaned, re-injecting button');
          existingButton.remove();
          // Reset retry count to allow fresh injection
          injectRetryCount = 0;
          // Small delay to let GitHub finish updating the DOM
          setTimeout(() => {
            injectDashboardButton();
          }, 50);
        }
      }
    });

    // Observe the document body for navigation bar changes
    navigationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
  };

  /* ---------------------------------------------------------
   * Toggle Dashboard
   * --------------------------------------------------------- */
  const toggleDashboard = () => {
    if (dashboardContainer && dashboardContainer.parentNode) {
      hideDashboard();
    } else {
      showDashboard();
    }
  };

  // Show dashboard and hide original content
  const showDashboard = () => {
    previousUrl = window.location.pathname;
    isDashboardActive = true;
    
    // Deselect all other nav items with multiple approaches
    const navContainer = document.querySelector('nav[aria-label="Repository"]');
    if (navContainer) {
      const allNavItems = navContainer.querySelectorAll('a[role="tab"], .UnderlineNav-item');
      allNavItems.forEach(item => {
        item.setAttribute('aria-selected', 'false');
        item.removeAttribute('aria-current');
        item.classList.remove('selected');
      });
    }
    
    if (dashboardButton) {
      dashboardButton.setAttribute('aria-selected', 'true');
      dashboardButton.setAttribute('aria-current', 'page');
      dashboardButton.classList.add('selected');
    }
    
    createDashboard();
  };

  // Hide dashboard and restore original content
  const hideDashboard = () => {
    isDashboardActive = false;
    
    // Clean up interval timer if it exists
    if (dashboardContainer) {
      const iframe = dashboardContainer.querySelector('#gha-dashboard-iframe');
      if (iframe && iframe.dataset.intervalId) {
        clearInterval(parseInt(iframe.dataset.intervalId));
      }
    }
    
    if (dashboardContainer && dashboardContainer.parentNode) {
      dashboardContainer.parentNode.removeChild(dashboardContainer);
      dashboardContainer = null;
    }
    
    if (originalContent && originalContent.parentNode) {
      originalContent.style.display = '';
      originalContent = null;
    }
    
    if (dashboardButton) {
      dashboardButton.setAttribute('aria-selected', 'false');
      dashboardButton.removeAttribute('aria-current');
      dashboardButton.classList.remove('selected');
    }
  };

  /* ---------------------------------------------------------
   * Create Dashboard iframe
   * --------------------------------------------------------- */
  const createDashboard = () => {
    if (dashboardContainer && dashboardContainer.parentNode) {
      dashboardContainer.parentNode.removeChild(dashboardContainer);
    }

    const turboFrame = document.querySelector('turbo-frame#repo-content-turbo-frame');
    const mainContent = turboFrame || 
                        document.querySelector('#js-repo-pjax-container') || 
                        document.querySelector('main') ||
                        document.querySelector('[data-turbo-frame="repo-content-turbo-frame"]');

    if (!mainContent) {
      console.error('[GHA Dashboard] Could not find main content area');
      return;
    }

    // Store reference to original content and hide it
    originalContent = mainContent;
    originalContent.style.display = 'none';

    // Create container that matches GitHub's layout exactly
    const container = document.createElement('div');
    container.id = 'gha-dashboard-container';
    container.style.cssText = `
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    `;

    // Create iframe with seamless integration
    const iframe = document.createElement('iframe');
    iframe.id = 'gha-dashboard-iframe';
    iframe.style.cssText = `
      width: 100%;
      height: 1000px;
      border: none;
      display: block;
      margin: 0;
      padding: 0;
    `;
    iframe.setAttribute('scrolling', 'no');
    
    let dashboardUrl;
    try {
      dashboardUrl = chrome.runtime.getURL('src/dashboard/dashboard.html');
    } catch (e) {
      console.error("[GHA Dashboard] Extension context invalidated:", e);
      // Force a hard refresh like F5
      window.location.reload();
      return;
    }
    iframe.src = dashboardUrl;

    // Dynamically resize iframe to fit content and remove all scrollbars
    iframe.onload = () => {
      if (!iframe.parentNode || !dashboardContainer || !dashboardContainer.parentNode) {
        return;
      }
      
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const iframeWin = iframe.contentWindow;
        
        if (!iframeWin || !iframeDoc) {
          return;
        }
        
        // Force overflow visible on all elements
        const style = iframeDoc.createElement('style');
        style.textContent = `
          html, body, #root {
            overflow: visible !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
        `;
        iframeDoc.head.appendChild(style);
        
        // Function to resize iframe based on content
        const resizeIframe = () => {
          if (!iframe.parentNode || !dashboardContainer || !dashboardContainer.parentNode) {
            return;
          }
          
          try {
            const root = iframeDoc.getElementById('root');
            if (!root) return;

            const height = Math.max(
              iframeDoc.body.scrollHeight,
              iframeDoc.documentElement.scrollHeight,
              root.scrollHeight
            );
            
            iframe.style.height = (height + 50) + 'px';
          } catch (e) {
            // Silent fail - element likely removed
          }
        };
        
        // Initial resize after short delay for React to render
        setTimeout(resizeIframe, 500);
        
        // Watch for content changes
        const observer = new MutationObserver(resizeIframe);
        const root = iframeDoc.getElementById('root');
        if (root) {
          observer.observe(root, {
            childList: true,
            subtree: true
          });
        }
        
        // Resize on window resize
        window.addEventListener('resize', resizeIframe);
        
        // Periodic check
        const intervalId = setInterval(resizeIframe, 500);
        iframe.dataset.intervalId = intervalId;
        
      } catch (e) {
        // Silent fail - likely CORS or element removed
        iframe.style.height = '3000px';
      }
    };

    container.appendChild(iframe);
    
    // Insert the dashboard right after the original content
    mainContent.parentNode.insertBefore(container, mainContent.nextSibling);
    
    dashboardContainer = container;

    console.log('[GHA Dashboard] Dashboard container created');
  };

  // Initialize when DOM is ready
  const initialize = () => {
    if (isGitHubRepoPage()) {
      // Try injecting immediately
      injectDashboardButton();
      // Also set up observer to catch navigation bar when it appears/updates
      observeForNavigationBar();
    }
  };

  /* ---------------------------------------------------------
   * Observe GitHub navigation (PJAX / Turbo)
   * --------------------------------------------------------- */
  const observeNavigation = () => {
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        // Remove existing button and dashboard on navigation
        const existingBtn = document.querySelector('#gha-dashboard-nav-button');
        if (existingBtn) {
          existingBtn.remove();
        }
        if (dashboardContainer && dashboardContainer.parentNode) {
          dashboardContainer.parentNode.removeChild(dashboardContainer);
          dashboardContainer = null;
        }
        if (originalContent && originalContent.parentNode) {
          originalContent.style.display = '';
          originalContent = null;
        }
        dashboardButton = null;
        injectRetryCount = 0; // Reset retry count on navigation
        
        if (isGitHubRepoPage()) {
          // Re-setup observer for navigation bar
          observeForNavigationBar();
          // Try injecting immediately
          setTimeout(() => {
            injectDashboardButton();
          }, 100);
        }
      }
    }).observe(document.body, { subtree: true, childList: true });
  };

  /* ---------------------------------------------------------
   * Init
   * --------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  observeNavigation();
})();
