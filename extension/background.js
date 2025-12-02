// Background Service Worker - WebSocket Manager with GitHub Token

const wsCache = new Map();
let activeWebSocket = null;
let currentRepo = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === "openDashboardTab") {
    chrome.tabs.create({
      url: chrome.runtime.getURL("react_page/index.html")
    });
    sendResponse({ success: true });
    return true;
  }
  
  if (request.type === "UPDATE_REPO") {
    chrome.storage.local.set({ currentRepo: request.repo });
    return true;
  }
  
  if (request.action === "startWebSocketExtraction") {
    const { repo, filters } = request;
    
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

function startWebSocketExtraction(repo, filters = {}, tabId) {
  if (activeWebSocket) {
    activeWebSocket.close();
    activeWebSocket = null;
  }
  
  currentRepo = repo;
  
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
          error: 'GitHub token not configured. Please go to Settings.', 
          repo: repo 
        }
      });
      return;
    }
    
    // Build WebSocket URL with token
    const encodedRepo = encodeURIComponent(repo);
    let wsUrl = `ws://localhost:3000/data/${encodedRepo}?aggregationPeriod=day&token=${encodeURIComponent(token)}`;
    
    if (filters.start) {
      const startDate = filters.start.split('T')[0];
      wsUrl += `&startDate=${startDate}`;
    }
    if (filters.end) {
      const endDate = filters.end.split('T')[0];
      wsUrl += `&endDate=${endDate}`;
    }
    
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
        if (cache) {
          cache.isComplete = true;
        }
        
        chrome.storage.local.set({ 
          wsStatus: { 
            isStreaming: false, 
            isComplete: true, 
            repo: repo, 
            totalRuns: cache?.runs?.length || 0,
            totalPages: cache?.pageCount || 0
          }
        });
        
        activeWebSocket = null;
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
            error: 'WebSocket connection failed', 
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
