import { triggerExtraction } from "../dashboard/api.js";
(function() {
  'use strict';

  let dashboardContainer = null;
  let dashboardButton = null;
  let originalContent = null; // Store original page content
  let previousUrl = null; // Track URL before showing dashboard
  let isDashboardActive = false; // Track if dashboard is currently shown

  function detectAndStoreRepo() {
  const match = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+)/);
  if (match) {
    const repo = `${match[1]}/${match[2]}`;
    chrome.storage.local.set({ currentRepo: repo });
    console.log("📌 Repo détecté et stocké :", repo);
  }
}

  // Check if we're on a GitHub repository page
  const isGitHubRepoPage = () => { 
    const pathParts = window.location.pathname.split('/').filter(p => p);
    // Check if we have at least owner/repo structure
    return pathParts.length >= 2 && window.location.hostname === 'github.com';
  };

  // Create and inject the dashboard button into GitHub's navigation bar
 const injectDashboardButton = () => {
  if (document.querySelector('#gha-dashboard-nav-button')) return;

  // Trouver la UL qui contient les tabs GitHub
  const navList =
    document.querySelector('nav[aria-label="Repository"] ul.UnderlineNav-body') ||
    document.querySelector('nav.UnderlineNav ul.UnderlineNav-body') ||
    document.querySelector('nav .UnderlineNav-body');

  console.log("🔍 navList found:", navList);

  if (!navList) {
    console.log("⏳ Retry injectDashboardButton...");
    setTimeout(injectDashboardButton, 300);
    return;
  }

  const navItem = document.createElement('li');
  navItem.id = 'gha-dashboard-nav-button';
  navItem.classList.add('UnderlineNav-item');

  navItem.innerHTML = `
      <a role="tab" class="UnderlineNav-item" style="cursor:pointer;">
        📊 Actions Dashboard
      </a>
  `;

  navList.appendChild(navItem);

  navItem.querySelector('a').addEventListener('click', e => {
    e.preventDefault();
    toggleDashboard();
  });

  console.log("✅ Dashboard button injected!");
};


  // Toggle dashboard panel visibility
  const toggleDashboard = () => {
    if (dashboardContainer && dashboardContainer.parentNode) {
      hideDashboard();
    } else {
      showDashboard();
    }
  };

  // Show dashboard and hide original content
  const showDashboard = async () => {
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
    const repo = await new Promise(resolve => {
        chrome.storage.local.get(["currentRepo"], r => resolve(r.currentRepo));
    });

    console.log("📦 Launching extraction for dashboard:", repo);

    const extractionResult = await triggerExtraction(repo);

    if (!extractionResult || !extractionResult.success) {
        alert("❌ Extraction failed. Check backend logs.");
        return;
    }

    console.log("📊 Extraction done, loading dashboard...");
    
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

  // Create the inline dashboard container with iframe
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
    
    const dashboardUrl = chrome.runtime.getURL('dashboard.html');
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
      injectDashboardButton();
      detectAndStoreRepo();

    }
  };

  // Watch for navigation changes (GitHub uses PJAX/Turbo)
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
        
        if (isGitHubRepoPage()) {
          setTimeout(injectDashboardButton, 800); // instead of 100
        }

        if (isGitHubRepoPage()) {
          detectAndStoreRepo();
        }

      }
    }).observe(document.body, { subtree: true, childList: true });
  };

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  observeNavigation();
})();
