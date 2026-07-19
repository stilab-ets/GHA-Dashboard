(function () {
  'use strict';

  const browser = globalThis.browser || window.browser;

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

  const detectGitHubTheme = () => {
    const mode = document.documentElement.getAttribute('data-color-mode');
    if (mode === 'light' || mode === 'dark') return mode;

    const colorScheme = getComputedStyle(document.documentElement).colorScheme;
    if (/\bdark\b/i.test(colorScheme)) return 'dark';
    if (/\blight\b/i.test(colorScheme)) return 'light';

    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  };

  const reloadAfterExtensionContextInvalidated = () => {
    console.info("[GHA Dashboard] Extension was reloaded; refreshing GitHub page to restore dashboard context.");
    window.setTimeout(() => window.location.reload(), 50);
  };

  const syncGitHubContext = () => {
    if (location.hostname !== "github.com") return;

    const repo = extractRepoFromURL(location.href);
    const theme = detectGitHubTheme();

    if (repo && browser.runtime) {
      try {
        browser.runtime.sendMessage({ type: "UPDATE_REPO", repo, theme });
      } catch (e) {
        reloadAfterExtensionContextInvalidated();
      }
    }
  };

  /* ---------------------------------------------------------
   * FIX 2: Detect repo at first load
   * --------------------------------------------------------- */
  (function detectRepoOnGitHub() {
    if (location.hostname !== "github.com") return;

    const repo = extractRepoFromURL(location.href);
    console.log(" [ContentScript] Detected repo:", repo);

    if (repo) syncGitHubContext();
  })();

  /* ---------------------------------------------------------
   *  Internal state
   * --------------------------------------------------------- */
  let dashboardContainer = null;
  let dashboardButton = null;
  let originalContent = null;
  let previousUrl = null;
  let isDashboardActive = false;

  const ensureDashboardHostStyles = () => {
    if (document.getElementById('gha-dashboard-host-styles')) return;

    const style = document.createElement('style');
    style.id = 'gha-dashboard-host-styles';
    style.textContent = `
      body.gha-dashboard-active #gha-dashboard-container {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        overflow: visible !important;
      }
      #gha-dashboard-iframe.gha-dashboard-fullscreen-frame {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        max-width: 100vw !important;
        height: 100vh !important;
        min-height: 100vh !important;
        z-index: 2147483646 !important;
      }
      #gha-dashboard-hint-popup {
        position: fixed;
        z-index: 2147483647;
        box-sizing: border-box;
        width: min(460px, calc(100vw - 24px));
        max-height: calc(100vh - 24px);
        overflow: auto;
        padding: 12px;
        color: #172033;
        background: #fff;
        border: 1px solid #d8dee8;
        border-radius: 6px;
        box-shadow: 0 12px 28px rgba(16, 24, 40, 0.2);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow-wrap: break-word;
      }
      #gha-dashboard-hint-popup[data-theme="dark"] {
        color: #ddd;
        background: #222;
        border-color: #555;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
      }
      #gha-dashboard-hint-popup .gha-dashboard-hint-title {
        margin: 0 0 8px;
        padding-right: 24px;
        font-size: 14px;
        font-weight: 800;
      }
      #gha-dashboard-hint-popup .gha-dashboard-hint-close {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        margin: 0;
        padding: 0;
        color: inherit;
        background: transparent;
        border: 0;
        border-radius: 4px;
        cursor: pointer;
        font: inherit;
        font-size: 18px;
      }
      #gha-dashboard-hint-popup .gha-dashboard-hint-close:hover,
      #gha-dashboard-hint-popup .gha-dashboard-hint-close:focus-visible {
        background: rgba(127, 127, 127, 0.18);
        outline: none;
      }
    `;
    document.head.appendChild(style);
  };

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

    const firstNavAnchor = nav.querySelector('li[class] a[class]');
    const navItem = document.createElement('li');
    navItem.id = 'gha-dashboard-nav-button';
    navItem.className = firstNavAnchor?.closest('li')?.className || 'd-flex';

    const button = document.createElement('a');
    button.href = '#';
    button.className = firstNavAnchor?.className || 'UnderlineNav-item';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.innerHTML = `
      <span data-component="icon">
        <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" style="fill: currentColor; margin-right: 4px; vertical-align: text-bottom; display: inline-block; overflow: visible;">
          <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"></path>
        </svg>
      </span>
      <span data-component="text" data-content="GHA-Dashboard">GHA-Dashboard</span>
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
    ensureDashboardHostStyles();
    document.body.classList.add('gha-dashboard-active');
    
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
    document.body.classList.remove('gha-dashboard-active');
    
    // Clean up interval timer if it exists
    if (dashboardContainer) {
      const iframe = dashboardContainer.querySelector('#gha-dashboard-iframe');
      if (iframe && iframe.dataset.intervalId) {
        clearInterval(parseInt(iframe.dataset.intervalId));
      }
      if (iframe && typeof iframe._ghaResizeCleanup === 'function') {
        iframe._ghaResizeCleanup();
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
      const existingIframe = dashboardContainer.querySelector('#gha-dashboard-iframe');
      if (existingIframe && typeof existingIframe._ghaResizeCleanup === 'function') {
        existingIframe._ghaResizeCleanup();
      } else if (existingIframe && existingIframe.dataset.intervalId) {
        clearInterval(parseInt(existingIframe.dataset.intervalId));
      }
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
      min-width: 0;
      min-height: 360px;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      overflow: visible;
    `;

    // Create iframe with seamless integration
    const iframe = document.createElement('iframe');
    iframe.id = 'gha-dashboard-iframe';
    iframe.style.cssText = `
      width: 100%;
      max-width: 100%;
      min-width: 0;
      height: 360px;
      min-height: 360px;
      border: none;
      display: block;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      overflow: hidden;
    `;
    iframe.setAttribute('scrolling', 'no');

    let dashboardFullscreen = false;
    let hostHintPopup = null;
    let hostHintState = null;
    const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

    const notifyHintClosed = (id) => {
      iframe.contentWindow?.postMessage({ type: 'GHA_DASHBOARD_HINT_CLOSED', id }, '*');
    };

    const positionDashboardHint = () => {
      if (!hostHintPopup || !hostHintState?.anchor) return;

      const padding = 12;
      const viewport = {
        width: document.documentElement.clientWidth || window.innerWidth,
        height: document.documentElement.clientHeight || window.innerHeight
      };
      const frame = iframe.getBoundingClientRect();
      const anchor = {
        left: frame.left + hostHintState.anchor.left,
        top: frame.top + hostHintState.anchor.top,
        bottom: frame.top + hostHintState.anchor.bottom
      };
      const popup = hostHintPopup.getBoundingClientRect();
      const placeAbove = anchor.top - padding >= popup.height + 10 ||
        anchor.top >= viewport.height - anchor.bottom;
      const preferredTop = placeAbove ? anchor.top - popup.height - 10 : anchor.bottom + 10;

      hostHintPopup.style.left = `${clamp(anchor.left, padding, viewport.width - popup.width - padding)}px`;
      hostHintPopup.style.top = `${clamp(preferredTop, padding, viewport.height - popup.height - padding)}px`;
      hostHintPopup.style.visibility = 'visible';
    };

    const closeDashboardHint = (notifyIframe = true) => {
      if (!hostHintPopup) return;

      const id = hostHintState?.id;
      hostHintPopup.remove();
      hostHintPopup = null;
      hostHintState = null;
      if (notifyIframe) notifyHintClosed(id);
    };

    const handleHostHintOutsideClick = (event) => {
      if (hostHintPopup && !hostHintPopup.contains(event.target)) {
        closeDashboardHint(true);
      }
    };

    const openDashboardHint = (data) => {
      if (!data?.anchor || !data?.id) return;

      closeDashboardHint(true);
      hostHintState = {
        id: data.id,
        anchor: data.anchor
      };

      const popup = document.createElement('div');
      popup.id = 'gha-dashboard-hint-popup';
      popup.dataset.theme = data.theme === 'light' ? 'light' : 'dark';
      popup.style.visibility = 'hidden';
      popup.setAttribute('role', 'dialog');
      popup.setAttribute('aria-label', data.explanation?.title || 'Information');

      const title = document.createElement('div');
      title.className = 'gha-dashboard-hint-title';
      title.textContent = data.explanation?.title || 'Information';

      const text = document.createElement('div');
      text.textContent = data.explanation?.text || '';

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'gha-dashboard-hint-close';
      closeButton.setAttribute('aria-label', 'Close explanation');
      closeButton.textContent = '×';
      closeButton.addEventListener('click', () => closeDashboardHint(true));

      popup.append(title, text, closeButton);
      document.body.appendChild(popup);
      hostHintPopup = popup;

      positionDashboardHint();
    };

    const setDashboardFrameFullscreen = (isFullscreen) => {
      dashboardFullscreen = Boolean(isFullscreen);
      iframe.classList.toggle('gha-dashboard-fullscreen-frame', dashboardFullscreen);
      if (dashboardFullscreen) closeDashboardHint(true);
    };

    const setDashboardFrameHeight = (height) => {
      if (dashboardFullscreen) return;

      const parsedHeight = Number(height);
      if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) return;

      const nextHeight = Math.ceil(Math.max(360, Math.min(parsedHeight + 8, 50000)));
      iframe.style.height = `${nextHeight}px`;
      iframe.style.minHeight = `${nextHeight}px`;
      container.style.height = `${nextHeight}px`;
      container.style.minHeight = `${nextHeight}px`;
    };

    const handleDashboardMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      switch (event.data?.type) {
        case 'GHA_DASHBOARD_HEIGHT':
          setDashboardFrameHeight(event.data.height);
          break;
        case 'GHA_DASHBOARD_FULLSCREEN':
          setDashboardFrameFullscreen(event.data.active);
          break;
        case 'GHA_DASHBOARD_HINT_OPEN':
          openDashboardHint(event.data);
          break;
        case 'GHA_DASHBOARD_HINT_CLOSE':
          if (!hostHintState || event.data.id === hostHintState.id) closeDashboardHint(false);
          break;
      }
    };

    const cleanupOverlayHandlers = () => {
      closeDashboardHint(false);
      window.removeEventListener('resize', positionDashboardHint);
      window.removeEventListener('scroll', positionDashboardHint, true);
      document.removeEventListener('mousedown', handleHostHintOutsideClick, true);
    };

    window.addEventListener('message', handleDashboardMessage);
    window.addEventListener('resize', positionDashboardHint);
    window.addEventListener('scroll', positionDashboardHint, { passive: true, capture: true });
    document.addEventListener('mousedown', handleHostHintOutsideClick, true);
    iframe._ghaResizeCleanup = () => {
      cleanupOverlayHandlers();
      window.removeEventListener('message', handleDashboardMessage);
    };
    
    let dashboardUrl;
    try {
      dashboardUrl = browser.runtime.getURL('src/dashboard/dashboard.html');
    } catch (e) {
      reloadAfterExtensionContextInvalidated();
      return;
    }
    iframe.src = `${dashboardUrl}?theme=${encodeURIComponent(detectGitHubTheme())}`;

    // Dynamically resize iframe to fit content and remove all scrollbars
    iframe.onload = () => {
      if (!iframe.parentNode || !container.parentNode) {
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
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          .dashboard,
          .dashboard .container,
          .dashboard-grid,
          .dashboard-chart-card,
          .chart-wheel-area,
          .chart-body {
            min-width: 0 !important;
          }
          .chart-wheel-area {
            min-height: 280px !important;
          }
          .chart-wheel-area-large,
          .time-to-fix-chart,
          .failure-worsening-body {
            min-height: 320px !important;
          }
        `;
        iframeDoc.head.appendChild(style);

        const getMinimumDashboardHeight = () => {
          if (iframeDoc.querySelector('.collection-scope-panel')) {
            return 360;
          }

          const iframeRect = iframe.getBoundingClientRect();
          const viewportHeight = window.innerHeight || 900;
          const remainingViewport = viewportHeight - Math.max(0, iframeRect.top);
          return Math.max(360, Math.min(720, remainingViewport + 80));
        };
        
        const postThemeToDashboard = () => {
          try {
            iframeWin.postMessage({
              type: 'GHA_DASHBOARD_THEME',
              theme: detectGitHubTheme()
            }, '*');
          } catch (e) {
            // The iframe may be unloading during GitHub navigation.
          }
        };

        // Function to resize iframe based on content
        const resizeIframe = () => {
          if (!iframe.parentNode || !container.parentNode) {
            return;
          }
          
          try {
            const root = iframeDoc.getElementById('root');
            if (!root) return;

            const dashboard = root.querySelector('.dashboard') || root;
            const rootRect = root.getBoundingClientRect();
            const dashboardRect = dashboard.getBoundingClientRect();
            const dashboardStyles = iframeWin.getComputedStyle(dashboard);
            const dashboardPaddingBottom = parseFloat(dashboardStyles.paddingBottom) || 0;
            const measurementSelectors = [
              ':scope > *',
              ':scope .container > *',
              ':scope .collection-start',
              ':scope .collection-banner',
              ':scope .overall-health-section',
              ':scope .dashboard-header',
              ':scope .filter-panel',
              ':scope .stats-row',
              ':scope .dashboard-grid',
              ':scope .dashboard-grid > *',
              ':scope .stats-panel',
              ':scope .table-wrapper'
            ];
            const measuredElements = Array.from(new Set(
              measurementSelectors.flatMap((selector) => Array.from(dashboard.querySelectorAll(selector)))
            )).filter((element) => {
              const style = iframeWin.getComputedStyle(element);
              return style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                !element.closest('.dashboard-chart-popup-layer') &&
                !element.classList.contains('dashboard-chart-popup');
            });
            const contentBottom = measuredElements.reduce((bottom, element) => {
              const elementRect = element.getBoundingClientRect();
              const elementStyles = iframeWin.getComputedStyle(element);
              const marginBottom = parseFloat(elementStyles.marginBottom) || 0;
              return Math.max(bottom, elementRect.bottom + marginBottom);
            }, dashboardRect.bottom);
            const height = Math.max(
              getMinimumDashboardHeight(),
              contentBottom - rootRect.top + dashboardPaddingBottom
            );
            const nextHeight = Math.ceil(height);
            
            setDashboardFrameHeight(nextHeight);
          } catch (e) {
            // Silent fail - element likely removed
          }
        };

        // Initial resize after short delay for React to render
        setTimeout(resizeIframe, 500);
        setTimeout(postThemeToDashboard, 100);
        
        // Watch for content changes
        const observer = new MutationObserver(resizeIframe);
        const root = iframeDoc.getElementById('root');
        if (root) {
          observer.observe(root, {
            childList: true,
            subtree: true
          });
        }

        const resizeObserver = typeof ResizeObserver !== 'undefined' && root
          ? new ResizeObserver(resizeIframe)
          : null;
        if (resizeObserver) {
          resizeObserver.observe(root);
          resizeObserver.observe(iframeDoc.body);
        }
        
        // Resize on window resize
        window.addEventListener('resize', resizeIframe);
        window.addEventListener('focus', postThemeToDashboard);
        
        // Periodic check
        const intervalId = setInterval(resizeIframe, 500);
        iframe.dataset.intervalId = intervalId;
        iframe._ghaResizeCleanup = () => {
          cleanupOverlayHandlers();
          clearInterval(intervalId);
          observer.disconnect();
          if (resizeObserver) {
            resizeObserver.disconnect();
          }
          window.removeEventListener('resize', resizeIframe);
          window.removeEventListener('focus', postThemeToDashboard);
          window.removeEventListener('message', handleDashboardMessage);
        };
        
      } catch (e) {
        // Silent fail - likely CORS or element removed
        setDashboardFrameHeight(Math.max(1200, window.innerHeight || 1000));
      }
    };

    dashboardContainer = container;
    container.appendChild(iframe);
    
    // Insert the dashboard right after the original content
    mainContent.parentNode.insertBefore(container, mainContent.nextSibling);

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
        document.body.classList.remove('gha-dashboard-active');
        if (originalContent && originalContent.parentNode) {
          originalContent.style.display = '';
          originalContent = null;
        }
        dashboardButton = null;
        injectRetryCount = 0; // Reset retry count on navigation
        
        if (isGitHubRepoPage()) {
          syncGitHubContext();
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

  const themeObserver = new MutationObserver(() => {
    syncGitHubContext();
    const iframe = document.getElementById('gha-dashboard-iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'GHA_DASHBOARD_THEME',
        theme: detectGitHubTheme()
      }, '*');
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-color-mode', 'data-light-theme', 'data-dark-theme', 'class', 'style']
  });

  if (window.matchMedia) {
    const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => {
      syncGitHubContext();
      const iframe = document.getElementById('gha-dashboard-iframe');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'GHA_DASHBOARD_THEME',
          theme: detectGitHubTheme()
        }, '*');
      }
    };
    if (themeMediaQuery.addEventListener) {
      themeMediaQuery.addEventListener('change', syncSystemTheme);
    }
  }
})();
