// Background Service Worker - WebSocket Manager with GitHub Token

const wsCache = new Map();
let activeWebSocket = null;
let currentRepo = null;
let currentTabId = null; // Tab owning the active WebSocket

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.type === "UPDATE_REPO") {
    const tabId = sender?.tab?.id;
    if (typeof tabId === 'number') {
      // Store repo name per-tab so multiple GitHub tabs don't overwrite
      // each other's "currentRepo" value.
      const key = `currentRepo_${tabId}`;
      chrome.storage.local.set({ [key]: request.repo });
    }
    return true;
  }
  
  if (request.action === "startWebSocketExtraction") {
    const { repo, filters } = request;
    
    // If another repository is currently streaming, do not start a new one.
    // Instead, signal the caller that the backend is busy so it can show
    // an appropriate error and allow retrying later without stealing
    // the existing stream.
    if (activeWebSocket && currentRepo && currentRepo !== repo) {
      const cached = wsCache.get(currentRepo);
      sendResponse({
        success: false,
        busy: true,
        currentRepo,
        isComplete: cached?.isComplete || false,
        itemCount: cached?.runs?.length || 0
      });
      return true;
    }
    
    // Check cache (only if same dates)
    const cached = wsCache.get(repo);
    if (cached && cached.isComplete && cached.startDate === filters.start && cached.endDate === filters.end) {
      sendResponse({ 
        success: true, 
        cached: true, 
        data: cached.runs,
        isComplete: true 
      });
      return true;
    }
    
    startWebSocketExtraction(repo, filters, sender.tab?.id);
    sendResponse({ success: true, cached: false, message: "WebSocket started" });
    return true;
  }
  
  if (request.action === "getWebSocketCacheStatus") {
    const { repo } = request;
    const cached = wsCache.get(repo);
    sendResponse({
      hasCache: !!cached,
      itemCount: cached?.runs?.length || 0,
      isComplete: cached?.isComplete || false
    });
    return true;
  }
  
  if (request.action === "clearWebSocketCache") {
    const { repo } = request;
    if (repo) {
      wsCache.delete(repo);
    } else {
      wsCache.clear();
    }
    chrome.storage.local.remove(['wsRuns', 'wsStatus']);
    sendResponse({ success: true });
    return true;
  }
  
  return false;
});

// Close WebSocket if the owner tab is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (currentTabId !== null && tabId === currentTabId && activeWebSocket) {
    try {
      activeWebSocket.close();
    } catch (e) {
      console.error('[Background] Error closing WebSocket on tab removal:', e);
    }
    activeWebSocket = null;
    currentRepo = null;
    currentTabId = null;
  }
});

// Close WebSocket if the owner tab is refreshed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeWebSocket || currentTabId === null) return;

  // We only care about the tab that owns the current WebSocket
  if (tabId !== currentTabId) return;

  // When the page starts loading again in that tab (F5 / hard reload),
  // immediately close the WebSocket so the backend is freed.
  if (changeInfo.status === 'loading') {
    try {
      activeWebSocket.close();
    } catch (e) {
      console.error('[Background] Error closing WebSocket on tab reload:', e);
    }
    activeWebSocket = null;
    currentRepo = null;
    currentTabId = null;
  }
});

function startWebSocketExtraction(repo, filters = {}, tabId) {
  if (activeWebSocket) {
    activeWebSocket.close();
    activeWebSocket = null;
  }
  
  currentRepo = repo;
  currentTabId = tabId ?? null;
  
  chrome.storage.local.set({ 
    wsRuns: [], 
    wsStatus: { isStreaming: true, isComplete: false, repo: repo, page: 0, totalRuns: 0 }
  });
  
  // Get GitHub token from storage
  chrome.storage.local.get(['githubToken'], (result) => {
    const token = result.githubToken;
    
    if (!token) {
      chrome.storage.local.set({ 
        wsStatus: { 
          isStreaming: false, 
          isComplete: false, 
          error: 'GitHub token not configured. Enter it in the extension popup.', 
          repo: repo 
        }
      });
      return;
    }
    
    // Build WebSocket URL with token
    const encodedRepo = repo.replace("/", "__");
    let wsUrl = `ws://localhost:3000/data/${encodedRepo}?aggregationPeriod=day&token=${encodeURIComponent(token)}`;
    
    if (filters.start) {
      wsUrl += `&startDate=${filters.start}`;
    }
    if (filters.end) {
      wsUrl += `&endDate=${filters.end}`;
    }
    // Force reset cache for new date selection
    wsCache.delete(repo);
    chrome.storage.local.set({ wsRuns: [] });

    wsCache.set(repo, { 
      runs: [], 
      isComplete: false, 
      pageCount: 0,
      startDate: filters.start,
      endDate: filters.end
    });
    
    try {
      activeWebSocket = new WebSocket(wsUrl);
      
      activeWebSocket.onopen = () => {
        chrome.storage.local.set({ 
          wsStatus: { isStreaming: true, isComplete: false, connected: true, repo: repo, page: 0, totalRuns: 0 }
        });
      };
      
      activeWebSocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const cache = wsCache.get(repo);
          
          if (message.type === 'runs') {
            cache.runs.push(...message.data);
            cache.pageCount = message.page;
            
            chrome.storage.local.set({ 
              wsRuns: [...cache.runs],
              wsStatus: { 
                isStreaming: true, 
                isComplete: false, 
                repo: repo, 
                page: message.page,
                totalRuns: cache.runs.length,
                hasMore: message.hasMore
              }
            });
          }
          else if (message.type === 'complete') {
            cache.isComplete = true;
            
            chrome.storage.local.set({ 
              wsStatus: { 
                isStreaming: false, 
                isComplete: true, 
                repo: repo, 
                totalRuns: cache.runs.length,
                totalPages: message.totalPages
              }
            });
          }
          else if (message.type === 'error') {
            console.error('[Background] Server error:', message.message);
            chrome.storage.local.set({ 
              wsStatus: { 
                isStreaming: false, 
                isComplete: false, 
                error: message.message, 
                repo: repo 
              }
            });
          }
          
        } catch (error) {
          console.error('[Background] Error parsing message:', error);
        }
      };
      
      activeWebSocket.onclose = (event) => {
        const cache = wsCache.get(repo);
        const hadData = cache?.runs?.length > 0;
        if (cache) {
          cache.isComplete = true;
        }

        if (!hadData) {
          chrome.storage.local.set({
            wsStatus: {
              isStreaming: false,
              isComplete: false,
              error: 'Unable to connect to API at ws://localhost:3000. Please verify the backend is running and reachable.',
              repo: repo
            }
          });
        } else {
          chrome.storage.local.set({ 
            wsStatus: { 
              isStreaming: false, 
              isComplete: true, 
              repo: repo, 
              totalRuns: cache?.runs?.length || 0,
              totalPages: cache?.pageCount || 0
            }
          });
        }

        activeWebSocket = null;
        // When the socket closes for any reason, clear ownership so
        // new repositories can start streaming.
        currentTabId = null;
      };
      
      activeWebSocket.onerror = (error) => {
        const cache = wsCache.get(repo);
        if (cache && cache.runs && cache.runs.length > 0) {
          return;
        }
        
        console.error('[Background] WebSocket error:', error);
        
        chrome.storage.local.set({ 
          wsStatus: { 
            isStreaming: false, 
            isComplete: false, 
            error: 'Unable to connect to API at ws://localhost:3000. Please verify the backend is running and reachable.', 
            repo: repo 
          }
        });
      };
      
    } catch (error) {
      console.error('[Background] Failed to create WebSocket:', error);
      
      chrome.storage.local.set({ 
        wsStatus: { 
          isStreaming: false, 
          isComplete: false, 
          error: error.message, 
          repo: repo 
        }
      });
    }
  });
}

console.log('[Background] GHA Dashboard Background Script loaded');
