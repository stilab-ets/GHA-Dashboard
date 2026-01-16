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
    // Check cache - if we have complete data for this repo, use it (regardless of date filters)
    // Date filtering is done client-side, so we don't need to check dates here
    if (cached && cached.isComplete) {
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
    wsStatus: { 
      isStreaming: true, 
      isComplete: false, 
      repo: repo, 
      page: 0, 
      totalRuns: 0, // Total count from API
      collectedRuns: 0, // What we've collected
      phase: 'workflow_runs',
      phase1_elapsed: null,
      phase2_elapsed: null
    }
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
    // Don't send date filters - collect ALL runs regardless of date
    // Date filtering will be done client-side
    const encodedRepo = encodeURIComponent(repo);
    // Use a wide date range to ensure we get all runs, but backend will ignore it anyway
    const now = new Date();
    const farPast = new Date(2000, 0, 1);
    const farFuture = new Date(2100, 0, 1);
    const startDate = farPast.toISOString().split('T')[0];
    const endDate = farFuture.toISOString().split('T')[0];
    
    let wsUrl = `ws://localhost:3000/data/${encodedRepo}?aggregationPeriod=day&token=${encodeURIComponent(token)}&startDate=${startDate}&endDate=${endDate}`;
    
    wsCache.set(repo, { 
      runs: [], 
      isComplete: false, 
      pageCount: 0,
      startDate: null,  // No date filtering - collect all
      endDate: null
    });
    
    // Add delay to allow backend to perform short-circuit check
    // This prevents premature WebSocket connection attempts when data might already be in DB
    setTimeout(() => {
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

          // ---- HANDLE LOG MESSAGES FROM BACKEND ----
        if (message.type === "log") {
          console.log("[Background] DB Log:", message.message);
          return;
        }

          
          if (message.type === 'runs') {
            // GHAminer sends runs with jobs already attached, so handle both cases:
            // 1. New runs to add
            // 2. Existing runs to update (if they come again)
            const newRuns = [];
            const updatedRunIds = new Set();
            
            message.data.forEach(run => {
              const index = cache.runs.findIndex(r => r.id === run.id);
              if (index >= 0) {
                // Update existing run
                cache.runs[index] = run;
                updatedRunIds.add(run.id);
              } else {
                // Add new run
                newRuns.push(run);
              }
            });
            
            // Add new runs
            if (newRuns.length > 0) {
              cache.runs.push(...newRuns);
            }
            
            cache.pageCount = message.page;
            
            const runsWithJobs = cache.runs.filter(r => r.jobs && r.jobs.length > 0).length;
            const totalJobs = cache.runs.reduce((sum, r) => sum + (r.jobs ? r.jobs.length : 0), 0);
            
            console.log('[Background] Received runs', {
              page: message.page,
              runsInPage: message.data.length,
              newRuns: newRuns.length,
              updatedRuns: updatedRunIds.size,
              totalRuns: cache.runs.length,
              runsWithJobs,
              totalJobs,
              phase: message.phase
            });
            
            // Get current status to preserve phase1_elapsed if it exists
            chrome.storage.local.get(['wsStatus'], (result) => {
              const currentStatus = result.wsStatus || {};
              // totalRuns from message is the total count (from API), collectedRuns is what we've collected
              const collectedRuns = cache.runs.length;
              const statusUpdate = {
                isStreaming: true, 
                isComplete: false, 
                repo: repo, 
                page: message.page,
                totalRuns: message.totalRuns || 0, // Total count from API (e.g., 632)
                collectedRuns: collectedRuns, // What we've collected so far
                runsWithJobs,
                totalJobs,
                phase: message.phase || 'workflow_runs',
                hasMore: message.hasMore,
                elapsed_time: message.elapsed_time || null,
                eta_seconds: message.eta_seconds || null
              };
              
              // Preserve phase1_elapsed if we're in Phase 2 (ALWAYS preserve)
              if (message.phase === 'jobs' && currentStatus.phase1_elapsed) {
                statusUpdate.phase1_elapsed = currentStatus.phase1_elapsed;
              } else if (currentStatus.phase1_elapsed) {
                // Also preserve if it was set before (even if phase changed)
                statusUpdate.phase1_elapsed = currentStatus.phase1_elapsed;
              }
              
              // Update phase2_elapsed if in jobs phase
              if (message.phase === 'jobs' && message.elapsed_time) {
                statusUpdate.phase2_elapsed = message.elapsed_time;
                statusUpdate.phase2_eta = message.eta_seconds || null;
              }
              
              chrome.storage.local.set({ 
                wsRuns: [...cache.runs],
                wsStatus: statusUpdate
              });
            });
          }
          else if (message.type === 'phase_complete') {
            // Phase 1 (runs) complete, Phase 2 (jobs) starting
            console.log('[Background] Phase complete', {
              phase: message.phase,
              totalRuns: message.totalRuns,
              elapsed_time: message.elapsed_time
            });
            
            chrome.storage.local.set({ 
              wsStatus: { 
                isStreaming: true, 
                isComplete: false, 
                repo: repo, 
                totalRuns: message.totalRuns, // Total count from API
                collectedRuns: cache.runs.length, // What we've collected
                phase: 'jobs',
                phase1_elapsed: message.elapsed_time || null
              }
            });
          }
          else if (message.type === 'job_progress') {
            // Update job collection progress
            const runsWithJobs = cache.runs.filter(r => r.jobs && r.jobs.length > 0).length;
            
            // Get current status to preserve phase1_elapsed
            chrome.storage.local.get(['wsStatus'], (result) => {
              const currentStatus = result.wsStatus || {};
              
              chrome.storage.local.set({ 
                wsRuns: [...cache.runs], // Trigger update
                wsStatus: { 
                  isStreaming: true, 
                  isComplete: false, 
                  repo: repo, 
                  totalRuns: message.total_runs || currentStatus.totalRuns || 0,
                  collectedRuns: cache.runs.length,
                  runsWithJobs,
                  totalJobs: message.jobs_collected,
                  phase: 'jobs',
                  phase1_elapsed: currentStatus.phase1_elapsed || null, // Always preserve Phase 1 elapsed
                  phase2_elapsed: message.elapsed_time || null,
                  phase2_eta: message.eta_seconds || null,
                  jobsProgress: {
                    runs_processed: message.runs_processed,
                    total_runs: message.total_runs,
                    jobs_collected: message.jobs_collected
                  }
                }
              });
            });
          }
          else if (message.type === 'complete') {
            cache.isComplete = true;
            
            const runsWithJobs = cache.runs.filter(r => r.jobs && r.jobs.length > 0).length;
            const totalJobs = cache.runs.reduce((sum, r) => sum + (r.jobs ? r.jobs.length : 0), 0);
            
            console.log('[Background] Collection complete', {
              totalRuns: cache.runs.length,
              runsWithJobs,
              totalJobs,
              totalPages: message.totalPages
            });
            
            chrome.storage.local.set({ 
              wsRuns: [...cache.runs], // Ensure final state is saved
              wsStatus: { 
                isStreaming: false, 
                isComplete: true, 
                repo: repo, 
                totalRuns: cache.runs.length,
                totalPages: message.totalPages,
                totalJobs: message.totalJobs || totalJobs,
                runsWithJobs
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
        console.log('[Background] DEBUG: WebSocket closed', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          repo: repo
        });
        
        const cache = wsCache.get(repo);
        const hadData = cache?.runs?.length > 0;
        const runsWithJobs = cache?.runs?.filter(r => r.jobs && r.jobs.length > 0).length || 0;
        
        console.log('[Background] DEBUG: onclose - cache state', {
          hadData,
          totalRuns: cache?.runs?.length || 0,
          runsWithJobs,
          cacheIsComplete: cache?.isComplete
        });
        
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
    }, 500); // 500ms delay for backend short-circuit check
  });
}

console.log('[Background] GHA Dashboard Background Script loaded');
