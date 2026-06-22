// Background Service Worker - WebSocket Manager with GitHub Token

const wsCache = new Map();
let activeWebSocket = null;
let currentRepo = null;
let currentTabId = null; // Tab owning the active WebSocket
let cancelRequestedForRepo = null;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;
const WS_CONNECT_MAX_ATTEMPTS = 3;
const WS_CONNECT_RETRY_DELAY_MS = 1000;

function isSocketActive(socket) {
  return socket && socket.readyState !== SOCKET_CLOSING && socket.readyState !== SOCKET_CLOSED;
}

function normalizeWorkflowIds(workflowIds) {
  if (!Array.isArray(workflowIds)) {
    return [];
  }

  return Array.from(
    new Set(
      workflowIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

function sameWorkflowScope(left = [], right = []) {
  const leftIds = normalizeWorkflowIds(left);
  const rightIds = normalizeWorkflowIds(right);
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((value, index) => value === rightIds[index])
  );
}

function cacheMatchesFilters(cached, filters = {}) {
  if (!cached) return false;
  return (
    (cached.startDate || null) === (filters.startDate || filters.start || null) &&
    (cached.endDate || null) === (filters.endDate || filters.end || null) &&
    sameWorkflowScope(cached.workflowIds, filters.workflowIds)
  );
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "UPDATE_REPO") {
    const tabId = sender?.tab?.id;
    const updates = {};

    if (typeof tabId === "number") {
      // Store repo name per-tab so multiple GitHub tabs don't overwrite
      // each other's "currentRepo" value.
      const key = `currentRepo_${tabId}`;
      if (request.repo) {
        updates[key] = request.repo;
      }
      if (request.theme === "light" || request.theme === "dark") {
        updates[`githubTheme_${tabId}`] = request.theme;
      }
    }

    if (request.repo) {
      updates.currentRepo = request.repo;
    }
    if (request.theme === "light" || request.theme === "dark") {
      updates.githubTheme = request.theme;
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
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
        itemCount: cached?.runs?.length || 0,
      });
      return true;
    }

    const forceRefresh = Boolean(filters?.forceRefresh);

    // Check cache (only if same dates)
    const cached = wsCache.get(repo);
    // Check cache - if we have complete data for this repo, use it (regardless of date filters)
    // Date filtering is done client-side, so we don't need to check dates here
    if (cached && cached.isComplete && cacheMatchesFilters(cached, filters) && !forceRefresh) {
      sendResponse({
        success: true,
        cached: true,
        data: cached.runs,
        isComplete: true,
      });
      return true;
    }

    // If the same repo is already streaming, keep that socket alive and let
    // the dashboard re-attach through chrome.storage updates.
    if (activeWebSocket && currentRepo === repo) {
      if (isSocketActive(activeWebSocket)) {
        if (cached) {
          chrome.storage.local.set({
            wsRuns: [...(cached.runs || [])],
            wsStatus: {
              isStreaming: true,
              isComplete: false,
              repo,
              totalRuns: cached.totalRuns || cached.runs?.length || 0,
              collectedRuns: cached.runs?.length || 0,
              phase: cached.phase || "workflow_runs",
            },
          });
        }

        sendResponse({
          success: true,
          cached: false,
          streaming: true,
          itemCount: cached?.runs?.length || 0,
        });
        return true;
      }

      activeWebSocket = null;
      currentRepo = null;
      currentTabId = null;
    }

    startWebSocketExtraction(repo, filters, sender.tab?.id);
    sendResponse({
      success: true,
      cached: false,
      message: "WebSocket started",
    });
    return true;
  }

  if (request.action === "getWebSocketCacheStatus") {
    const { repo } = request;
    const cached = wsCache.get(repo);
    sendResponse({
      hasCache: !!cached,
      itemCount: cached?.runs?.length || 0,
      isComplete: cached?.isComplete || false,
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
    chrome.storage.local.remove(["wsRuns", "wsStatus"]);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "cancelWebSocketExtraction") {
    const { repo } = request;

    if (repo && currentRepo && repo !== currentRepo) {
      sendResponse({
        success: false,
        error: `No active collection for ${repo}`,
      });
      return true;
    }

    const repoToCancel = currentRepo || repo;
    const cache = repoToCancel ? wsCache.get(repoToCancel) : null;
    cancelRequestedForRepo = repoToCancel;

    if (activeWebSocket) {
      try {
        activeWebSocket.close(1000, "Collection cancelled by user");
      } catch (e) {
        console.error("[Background] Error cancelling WebSocket:", e);
      }
    }

    if (repoToCancel) {
      chrome.storage.local.set({
        wsRuns: [...(cache?.runs || [])],
        wsStatus: {
          isStreaming: false,
          isComplete: false,
          isCancelled: true,
          repo: repoToCancel,
          totalRuns: cache?.totalRuns || cache?.runs?.length || 0,
          collectedRuns: cache?.runs?.length || 0,
          phase: cache?.phase || "workflow_runs",
        },
      });
    }

    activeWebSocket = null;
    currentRepo = null;
    currentTabId = null;

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
      console.error("[Background] Error closing WebSocket on tab removal:", e);
    }
    activeWebSocket = null;
    currentRepo = null;
    currentTabId = null;
  }
});

// Keep the WebSocket alive if the owner tab refreshes. GitHub can trigger a
// page load while the dashboard iframe is mounted; closing here aborts the
// first collection, then Retry appears to work only because data was cached.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!activeWebSocket || currentTabId === null) return;

  // We only care about the tab that owns the current WebSocket
  if (tabId !== currentTabId) return;

  if (changeInfo.status === "loading") {
    console.log("[Background] Owner tab is loading; keeping active WebSocket alive");
  }
});

function startWebSocketExtraction(repo, filters = {}, tabId) {
  if (activeWebSocket && currentRepo === repo && isSocketActive(activeWebSocket)) {
    return;
  }

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
      phase: "workflow_runs",
      phase1_elapsed: null,
      phase2_elapsed: null,
    },
  });

  // Get GitHub token from storage
  chrome.storage.session.get(["githubToken"], async (result) => {
    const token = result.githubToken;

    if (!token) {
      chrome.storage.local.set({
        wsStatus: {
          isStreaming: false,
          isComplete: false,
          error:
            "GitHub token not configured. Enter it in the extension popup.",
          repo: repo,
        },
      });
      return;
    }

    try {
      const extractionFilters = {
        aggregationPeriod: "day",
        ...filters,
      };

      const extractionResponse = await fetch(
        "http://127.0.0.1:3000/api/extractions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            repo,
            filters: extractionFilters,
          }),
        },
      );

      if (!extractionResponse.ok) {
        throw new Error(
          `Unable to create extraction session: ${extractionResponse.status}`,
        );
      }

      const extraction = await extractionResponse.json();

      if (!extraction.extractionId) {
        throw new Error("Backend did not return an extraction session");
      }

      const wsUrl = `ws://127.0.0.1:3000/data/${encodeURIComponent(extraction.extractionId)}`;

      wsCache.set(repo, {
        runs: [],
        isComplete: false,
        pageCount: 0,
        startDate:
          extractionFilters.startDate || extractionFilters.start || null,
        endDate: extractionFilters.endDate || extractionFilters.end || null,
        workflowIds: normalizeWorkflowIds(extractionFilters.workflowIds),
        phase1_elapsed: null, // Store Phase 1 elapsed time in memory to avoid race conditions
      });

      const connectWebSocket = (attempt = 1) => {
        let hasOpened = false;

        try {
          activeWebSocket = new WebSocket(wsUrl);

          activeWebSocket.onopen = () => {
            hasOpened = true;
            chrome.storage.local.set({
              wsStatus: {
                isStreaming: true,
                isComplete: false,
                connected: true,
                repo: repo,
                page: 0,
                totalRuns: 0,
              },
            });
          };

          activeWebSocket.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              const cache = wsCache.get(repo);

              // HANDLE LOG MESSAGES FROM BACKEND
              if (message.type === "log") {
                console.log("[Background] DB Log:", message.message);
                return;
              }

              if (message.type === "runs") {
                // GHAminer sends runs with jobs already attached, so handle both cases:
                // 1. New runs to add
                // 2. Existing runs to update (if they come again)
                const newRuns = [];
                const updatedRunIds = new Set();

                message.data.forEach((run) => {
                  const index = cache.runs.findIndex((r) => r.id === run.id);
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
                cache.totalRuns = message.totalRuns || cache.totalRuns || 0;
                cache.phase = message.phase || cache.phase || "workflow_runs";

                const runsWithJobs = cache.runs.filter(
                  (r) => r.jobs && r.jobs.length > 0,
                ).length;
                const totalJobs = cache.runs.reduce(
                  (sum, r) => sum + (r.jobs ? r.jobs.length : 0),
                  0,
                );

                console.log("[Background] Received runs", {
                  page: message.page,
                  runsInPage: message.data.length,
                  newRuns: newRuns.length,
                  updatedRuns: updatedRunIds.size,
                  totalRuns: cache.runs.length,
                  runsWithJobs,
                  totalJobs,
                  phase: message.phase,
                });

                // Use memory cache for phase1_elapsed (NO async race condition!)
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
                  phase: message.phase || "workflow_runs",
                  hasMore: message.hasMore,
                  elapsed_time: message.elapsed_time || null,
                  eta_seconds: message.eta_seconds || null,
                };

                // Preserve phase1_elapsed from memory cache if we're in Phase 2
                if (message.phase === "jobs" && cache.phase1_elapsed) {
                  statusUpdate.phase1_elapsed = cache.phase1_elapsed;
                  statusUpdate.phase2_elapsed = message.elapsed_time || null;
                  statusUpdate.phase2_eta = message.eta_seconds || null;
                }

                chrome.storage.local.set({
                  wsRuns: [...cache.runs],
                  wsStatus: statusUpdate,
                });
              } else if (message.type === "phase_complete") {
                // Phase 1 (runs) complete, Phase 2 (jobs) starting
                console.log("[Background] Phase complete", {
                  phase: message.phase,
                  totalRuns: message.totalRuns,
                  elapsed_time: message.elapsed_time,
                });

                // IMPORTANT: Store phase1_elapsed in memory cache to avoid race conditions
                cache.phase1_elapsed = message.elapsed_time || null;

                chrome.storage.local.set({
                  wsStatus: {
                    isStreaming: true,
                    isComplete: false,
                    repo: repo,
                    totalRuns: message.totalRuns, // Total count from API
                    collectedRuns: cache.runs.length, // What we've collected
                    phase: "jobs",
                    phase1_elapsed: cache.phase1_elapsed,
                  },
                });
              } else if (message.type === "job_progress") {
                // Update job collection progress
                const runsWithJobs = cache.runs.filter(
                  (r) => r.jobs && r.jobs.length > 0,
                ).length;

                // Use phase1_elapsed from memory cache (NO race condition!)
                chrome.storage.local.set({
                  wsRuns: [...cache.runs], // Trigger update
                  wsStatus: {
                    isStreaming: true,
                    isComplete: false,
                    repo: repo,
                    totalRuns: message.total_runs || 0,
                    collectedRuns: cache.runs.length,
                    runsWithJobs,
                    totalJobs: message.jobs_collected,
                    phase: "jobs",
                    phase1_elapsed: cache.phase1_elapsed || null, // From memory cache - no race condition!
                    phase2_elapsed: message.elapsed_time || null,
                    phase2_eta: message.eta_seconds || null,
                    jobsProgress: {
                      runs_processed: message.runs_processed,
                      total_runs: message.total_runs,
                      jobs_collected: message.jobs_collected,
                    },
                  },
                });
              } else if (message.type === "complete") {
                cache.isComplete = true;

                const runsWithJobs = cache.runs.filter(
                  (r) => r.jobs && r.jobs.length > 0,
                ).length;
                const totalJobs = cache.runs.reduce(
                  (sum, r) => sum + (r.jobs ? r.jobs.length : 0),
                  0,
                );

                console.log("[Background] Collection complete", {
                  totalRuns: cache.runs.length,
                  runsWithJobs,
                  totalJobs,
                  totalPages: message.totalPages,
                });

                chrome.storage.local.set({
                  wsRuns: [...cache.runs], // Ensure final state is saved
                  wsStatus: {
                    isStreaming: false,
                    isComplete: true,
                    repo: repo,
                    totalRuns: cache.runs.length,
                    collectedRuns: cache.runs.length,
                    totalPages: message.totalPages,
                    totalJobs: message.totalJobs || totalJobs,
                    runsWithJobs,
                    phase: message.phase || "workflow_runs",
                  },
                });
              } else if (message.type === "error") {
                console.error("[Background] Server error:", message.message);
                chrome.storage.local.set({
                  wsStatus: {
                    isStreaming: false,
                    isComplete: false,
                    error: message.message,
                    repo: repo,
                  },
                });
              }
            } catch (error) {
              console.error("[Background] Error parsing message:", error);
            }
          };

          activeWebSocket.onclose = (event) => {
            console.log("[Background] DEBUG: WebSocket closed", {
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
              repo: repo,
            });

            const cache = wsCache.get(repo);
            const wasCancelled = cancelRequestedForRepo === repo;
            const hadData = cache?.runs?.length > 0;
            const completed = !!cache?.isComplete;
            const runsWithJobs =
              cache?.runs?.filter((r) => r.jobs && r.jobs.length > 0).length ||
              0;

            console.log("[Background] DEBUG: onclose - cache state", {
              hadData,
              totalRuns: cache?.runs?.length || 0,
              runsWithJobs,
              cacheIsComplete: completed,
            });

            if (wasCancelled) {
              chrome.storage.local.set({
                wsRuns: [...(cache?.runs || [])],
                wsStatus: {
                  isStreaming: false,
                  isComplete: false,
                  isCancelled: true,
                  repo: repo,
                  totalRuns: cache?.totalRuns || cache?.runs?.length || 0,
                  collectedRuns: cache?.runs?.length || 0,
                  totalPages: cache?.pageCount || 0,
                  phase: cache?.phase || "workflow_runs",
                },
              });
            } else if (!hadData && !completed) {
              if (!hasOpened && attempt < WS_CONNECT_MAX_ATTEMPTS && currentRepo === repo) {
                console.log("[Background] WebSocket closed before opening; retrying", {
                  repo,
                  attempt,
                  nextAttempt: attempt + 1,
                });
                activeWebSocket = null;
                setTimeout(() => connectWebSocket(attempt + 1), WS_CONNECT_RETRY_DELAY_MS * attempt);
                return;
              }

              chrome.storage.local.set({
                wsStatus: {
                  isStreaming: false,
                  isComplete: false,
                  error:
                    "Unable to connect to API at ws://127.0.0.1:3000. Please verify the backend is running and reachable.",
                  repo: repo,
                },
              });
            } else {
              if (cache) {
                cache.isComplete = true;
              }

              chrome.storage.local.set({
                wsStatus: {
                  isStreaming: false,
                  isComplete: true,
                  repo: repo,
                  totalRuns: cache?.runs?.length || 0,
                  totalPages: cache?.pageCount || 0,
                },
              });
            }

            activeWebSocket = null;
            // When the socket closes for any reason, clear ownership so
            // new repositories can start streaming.
            if (currentRepo === repo) {
              currentRepo = null;
            }
            currentTabId = null;
            if (wasCancelled) {
              cancelRequestedForRepo = null;
            }
          };

          activeWebSocket.onerror = (error) => {
            const cache = wsCache.get(repo);
            if (cache && cache.runs && cache.runs.length > 0) {
              return;
            }

            console.error("[Background] WebSocket error:", error);

            chrome.storage.local.set({
              wsStatus: {
                isStreaming: false,
                isComplete: false,
                error:
                  "Unable to connect to API at ws://127.0.0.1:3000. Please verify the backend is running and reachable.",
                repo: repo,
              },
            });
          };
        } catch (error) {
          console.error("[Background] Failed to create WebSocket:", error);

          chrome.storage.local.set({
            wsStatus: {
              isStreaming: false,
              isComplete: false,
              error: error.message,
              repo: repo,
            },
          });
        }
      };

      // Add delay to allow backend to register the extraction session before
      // the WebSocket attempts to connect.
      setTimeout(() => connectWebSocket(), 500);
    } catch (error) {
      console.error("[Background] Failed to create extraction session:", error);

      chrome.storage.local.set({
        wsStatus: {
          isStreaming: false,
          isComplete: false,
          error: error.message,
          repo: repo,
        },
      });

      currentRepo = null;
      currentTabId = null;
    }
  });
}

console.log("[Background] GHA Dashboard Background Script loaded");
