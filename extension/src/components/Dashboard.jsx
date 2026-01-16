import { useEffect, useState, useRef } from 'react';
import { fetchDashboardDataViaWebSocket, clearWebSocketCache, filterRunsLocally } from '../websocket';
import '../styles/dashboardStyles.css';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  BarChart,
  Bar,
  Area,
  ReferenceLine,
  Brush
} from 'recharts';

const COLORS = ['#4caf50', '#f44336', '#ff9800', '#2196f3', '#9c27b0', '#00bcd4'];

function formatTimeValue(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0s';
  return formatTimeValue(seconds);
}

function formatDateForInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseDateStr(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(date1, date2) {
  if (!date1 || !date2) return false;
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

function isDateInRange(date, start, end) {
  if (!start || !end || !date) return false;
  const d = date.getTime();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return d >= s && d <= e;
}

export default function Dashboard() {
  // ============================================
  // State Management
  // ============================================

  const getCurrentDefaults = () => {
    const now = new Date();
    const defaultEnd = formatDateForInput(now);
    const defaultStart = formatDateForInput(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    return { defaultStart, defaultEnd };
  };

  const { defaultStart, defaultEnd } = getCurrentDefaults();

  // Main data states
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false); // Start as false so button shows initially
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ 
    items: 0, 
    complete: false, 
    isStreaming: false, 
    phase: 'workflow_runs',
    totalRuns: 0,
    elapsed_time: null,
    eta_seconds: null,
    phase1_elapsed: null,
    phase2_elapsed: null,
    phase2_eta: null
  });
  
  // Real-time elapsed time counter
  const [localElapsed, setLocalElapsed] = useState(0);
  const [phase1StartTime, setPhase1StartTime] = useState(null);
  const [phase2StartTime, setPhase2StartTime] = useState(null);
  const elapsedIntervalRef = useRef(null);
  const [jobProgress, setJobProgress] = useState({ runs_processed: 0, total_runs: 0, jobs_collected: 0, isCollecting: false });
  
  // Filter states
  const [availableFilters, setAvailableFilters] = useState({
    workflows: ['all'],
    branches: ['all'],
    actors: ['all']
  });
  
  // Store date filters in a ref to preserve them during collection
  const dateFiltersRef = useRef({ start: defaultStart, end: defaultEnd });
  
  const [filters, setFilters] = useState({
    workflow: ['all'],
    branch: ['all'],
    actor: ['all'],
    start: defaultStart,
    end: defaultEnd
  });

  // Current repo state
  const [currentRepo, setCurrentRepo] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [collectionStarted, setCollectionStarted] = useState(false);
  const prevDatesRef = useRef({ start: defaultStart, end: defaultEnd });

  const [openDropdowns, setOpenDropdowns] = useState({
    workflow: false,
    branch: false,
    actor: false
  });

  const [activeStatsTab, setActiveStatsTab] = useState('workflows');
  const [contributorSearchQuery, setContributorSearchQuery] = useState('');
  const [activeBranchEventTab, setActiveBranchEventTab] = useState('all');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectingStart, setSelectingStart] = useState(true);
  const [selectedWorkflowForDuration, setSelectedWorkflowForDuration] = useState('all');
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  // Zoom states for different charts (controlled Brush with startIndex/endIndex)
  const [durationVariabilityZoom, setDurationVariabilityZoom] = useState(null);
  const [cumulativeFailureZoom, setCumulativeFailureZoom] = useState(null);
  const [durationExplosionZoom, setDurationExplosionZoom] = useState(null);
  const [failureWorseningZoom, setFailureWorseningZoom] = useState(null);

  const dropdownRefs = {
    workflow: useRef(null),
    branch: useRef(null),
    actor: useRef(null)
  };
  const datePickerRef = useRef(null);

  // ============================================
  // Effects
  // ============================================

  useEffect(() => {
    const handleClickOutside = (event) => {
      Object.keys(dropdownRefs).forEach(key => {
        if (dropdownRefs[key].current && !dropdownRefs[key].current.contains(event.target)) {
          setOpenDropdowns(prev => ({ ...prev, [key]: false }));
        }
      });
      
      // Close date picker if clicking outside
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setDatePickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Extract repository name on mount to display in button
  useEffect(() => {
    const extractRepo = async () => {
      // First, try to extract repo from parent window URL (since we're in an iframe)
      let repo = null;
      
      try {
        // Access parent window URL
        const parentUrl = window.parent.location.href;
        if (parentUrl && parentUrl.includes('github.com')) {
          const urlObj = new URL(parentUrl);
          const parts = urlObj.pathname.split('/').filter(Boolean);
          if (parts.length >= 2) {
            repo = `${parts[0]}/${parts[1]}`;
            console.log('[Dashboard] Extracted repo from parent URL:', repo);
            setCurrentRepo(repo);
            return;
          }
        }
      } catch (e) {
        // If we can't access parent (CORS), fall back to storage
        console.log('[Dashboard] Cannot access parent URL, using storage fallback');
      }
      
      // Fallback to Chrome storage if parent URL extraction failed
      if (!repo && typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs && tabs[0];
          if (activeTab && typeof activeTab.id === 'number' && chrome.storage) {
            const key = `currentRepo_${activeTab.id}`;
            chrome.storage.local.get([key], (result) => {
              if (result[key]) {
                setCurrentRepo(result[key]);
              }
            });
          } else if (chrome.storage) {
            chrome.storage.local.get(['currentRepo'], (result) => {
              if (result.currentRepo) {
                setCurrentRepo(result.currentRepo);
              }
            });
          }
        });
      } else if (!repo && typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['currentRepo'], (result) => {
          if (result.currentRepo) {
            setCurrentRepo(result.currentRepo);
          }
        });
      }
    };

    extractRepo();
  }, []);

  // ============================================
  // Data Loading Functions
  // ============================================

  // Load data (only when dates change)
  const loadDashboardData = async () => {
    setCollectionStarted(true);
    setLoading(true);
    setError(null);
    setProgress({ items: 0, complete: false, isStreaming: true });
    setDataLoaded(false);
    
    try {
      // First, try to extract repo from parent window URL (since we're in an iframe)
      let repo = null;
      
      try {
        // Access parent window URL
        const parentUrl = window.parent.location.href;
        if (parentUrl && parentUrl.includes('github.com')) {
          const urlObj = new URL(parentUrl);
          const parts = urlObj.pathname.split('/').filter(Boolean);
          if (parts.length >= 2) {
            repo = `${parts[0]}/${parts[1]}`;
            console.log('[Dashboard] Extracted repo from parent URL:', repo);
          }
        }
      } catch (e) {
        // If we can't access parent (CORS), fall back to storage
        console.log('[Dashboard] Cannot access parent URL, using storage fallback');
      }
      
      // Fallback to Chrome storage if parent URL extraction failed
      if (!repo) {
        repo = await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
          // Get the active tab and use its per-tab repo key
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs && tabs[0];
            if (activeTab && typeof activeTab.id === 'number' && chrome.storage) {
              const key = `currentRepo_${activeTab.id}`;
              chrome.storage.local.get([key], (result) => {
                resolve(result[key]);
              });
            } else {
              chrome.storage.local.get(['currentRepo'], (result) => {
                resolve(result.currentRepo);
              });
            }
          });
        } else if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get(['currentRepo'], (result) => {
            resolve(result.currentRepo);
          });
          } else {
            resolve(null);
        }
      });
      }
      
      if (!repo) {
        throw new Error('Could not determine repository. Please navigate to a GitHub repository page.');
      }

      setCurrentRepo(repo);
      console.log('[Dashboard] Using repo:', repo);

      // Preserve existing date filters when starting new collection
      // Only initialize defaults if filters haven't been set yet
      if (!dateFiltersRef.current.start || !dateFiltersRef.current.end) {
        dateFiltersRef.current = { start: defaultStart, end: defaultEnd };
        setFilters(prev => ({ ...prev, start: defaultStart, end: defaultEnd }));
      }

      clearWebSocketCache(repo);
      
      // Get current filter values to use in callback (avoid closure issues)
      const currentFilters = { ...filters, start: dateFiltersRef.current.start, end: dateFiltersRef.current.end };
      
      const onProgress = (partialData, isComplete) => {
        // Save filter options
        if (partialData.workflows && partialData.workflows.length > 1) {
          setAvailableFilters({
            workflows: partialData.workflows,
            branches: partialData.branches || ['all'],
            actors: partialData.actors || ['all']
          });
        }
        
        // Get the latest filter values from ref (including date range)
        const latestFilters = {
          workflow: filters.workflow,
          branch: filters.branch,
          actor: filters.actor,
          start: dateFiltersRef.current.start,
          end: dateFiltersRef.current.end
        };
        
        // Apply local filters using latest filter values (including date range)
        const filteredData = applyLocalFiltersWithFilters(partialData, latestFilters);
        setData(filteredData);
        
        setProgress({ 
          items: partialData.totalRuns || 0, 
          complete: isComplete,
          isStreaming: !isComplete
        });
        setLoading(false);
        
        if (isComplete) {
          setDataLoaded(true);
        }
      };
      
      // Don't send date filters - collect ALL runs regardless of date
      // Date filtering will be done client-side
      const wsFilters = {
        start: null,  // No date filtering on collection
        end: null
      };
      
      await fetchDashboardDataViaWebSocket(repo, wsFilters, onProgress);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Error loading data: ' + err.message);
      setLoading(false);
      setProgress({ items: 0, complete: true, isStreaming: false });
    }
  };

  // ============================================
  // Filter Functions
  // ============================================

  // Apply local filters (including date) to collected data
  const applyLocalFilters = (rawData) => {
    if (!rawData) return rawData;
    
    // Always apply filters (including date) - filter all collected data client-side
    // Use dateFiltersRef to get the latest date values (preserved during collection)
    const filterValues = {
      workflow: filters.workflow,
      branch: filters.branch,
      actor: filters.actor,
      startDate: dateFiltersRef.current.start || filters.start,
      endDate: dateFiltersRef.current.end || filters.end
    };
    
    const filtered = filterRunsLocally(filterValues, rawData.repo || currentRepo);
    
    if (filtered) {
      // Keep original filter options
      return {
        ...filtered,
        workflows: rawData.workflows || availableFilters.workflows,
        branches: rawData.branches || availableFilters.branches,
        actors: rawData.actors || availableFilters.actors
      };
    }
    
      return rawData;
  };

  // Helper function to apply filters with explicit filter values (for callbacks)
  const applyLocalFiltersWithFilters = (rawData, explicitFilters) => {
    if (!rawData) return rawData;
    
    const filtered = filterRunsLocally({
      workflow: explicitFilters.workflow || filters.workflow,
      branch: explicitFilters.branch || filters.branch,
      actor: explicitFilters.actor || filters.actor,
      startDate: explicitFilters.start || dateFiltersRef.current.start || filters.start,
      endDate: explicitFilters.end || dateFiltersRef.current.end || filters.end
    }, rawData.repo || currentRepo);
    
    if (filtered) {
      return {
        ...filtered,
        workflows: rawData.workflows || availableFilters.workflows,
        branches: rawData.branches || availableFilters.branches,
        actors: rawData.actors || availableFilters.actors
      };
    }
    
    return rawData;
  };

  // Monitor storage changes and trigger data refresh when runs (with jobs) are updated
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    
    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      
      // Update progress state when wsStatus changes
      if (changes.wsStatus) {
        const status = changes.wsStatus.newValue || {};
        console.log('[Dashboard] wsStatus changed', {
          isStreaming: status.isStreaming,
          isComplete: status.isComplete,
          totalRuns: status.totalRuns,
          collectedRuns: status.collectedRuns,
          runsWithJobs: status.runsWithJobs,
          totalJobs: status.totalJobs,
          phase: status.phase,
          phase1_elapsed: status.phase1_elapsed,  // Debug: Phase 1 elapsed time
          phase2_elapsed: status.phase2_elapsed   // Debug: Phase 2 elapsed time
        });
        
        // Update main progress state (controls the streaming indicator)
        setProgress(prev => {
          // Start real-time counter when streaming starts
          if (status.isStreaming && !prev.isStreaming) {
            if (status.phase === 'workflow_runs') {
              setPhase1StartTime(Date.now());
              setLocalElapsed(0);
            } else if (status.phase === 'jobs' && !status.phase1_elapsed) {
              // Phase 1 just completed, Phase 2 starting (no phase1_elapsed from backend yet)
              setPhase1StartTime(null);
              setPhase2StartTime(Date.now());
              setLocalElapsed(0);
            } else if (status.phase === 'jobs' && status.phase1_elapsed) {
              // Phase 2 starting (phase1_elapsed from backend)
              setPhase2StartTime(Date.now());
              setLocalElapsed(0);
            }
          }
          
          // Stop counter when complete
          if (status.isComplete && prev.isStreaming) {
            setPhase1StartTime(null);
            setPhase2StartTime(null);
          }
          
          return {
            // Use collectedRuns if explicitly set, otherwise use previous items (don't fall back to totalRuns)
            items: (status.collectedRuns !== undefined && status.collectedRuns !== null) 
              ? status.collectedRuns 
              : (prev.items || 0), // Current collected count
            complete: status.isComplete || false,
            isStreaming: status.isStreaming || false,
            phase: status.phase || prev.phase || 'workflow_runs',
            totalRuns: status.totalRuns || prev.totalRuns || 0, // Total count from API
            elapsed_time: status.elapsed_time || prev.elapsed_time || null,
            eta_seconds: status.eta_seconds || prev.eta_seconds || null,
            phase1_elapsed: status.phase1_elapsed || prev.phase1_elapsed || null,
            phase2_elapsed: status.phase2_elapsed || prev.phase2_elapsed || null,
            phase2_eta: status.phase2_eta || prev.phase2_eta || null
          };
        });
        
        // Update job progress for Jobs tab
        if (status.phase === 'jobs' && status.jobsProgress) {
          setJobProgress({
            runs_processed: status.jobsProgress.runs_processed || 0,
            total_runs: status.jobsProgress.total_runs || 0,
            jobs_collected: status.jobsProgress.jobs_collected || 0,
            isCollecting: status.isStreaming && !status.isComplete
          });
        } else if (status.isComplete) {
          setJobProgress(prev => ({ ...prev, isCollecting: false }));
        }
      }
      
      // When runs are updated, refresh dashboard data
      if (changes.wsRuns && currentRepo) {
        const newRuns = changes.wsRuns.newValue || [];
        const runsWithJobs = newRuns.filter(r => r.jobs && r.jobs.length > 0).length;
        const totalJobs = newRuns.reduce((sum, r) => sum + (r.jobs ? r.jobs.length : 0), 0);
        
        console.log('[Dashboard] wsRuns changed', {
          totalRuns: newRuns.length,
          runsWithJobs,
          totalJobs
        });
        
        // Recalculate dashboard data with updated runs (which now include jobs)
        // Use dateFiltersRef to get the latest date values
    const filtered = filterRunsLocally({
      workflow: filters.workflow,
      branch: filters.branch,
          actor: filters.actor,
          startDate: dateFiltersRef.current.start || filters.start,
          endDate: dateFiltersRef.current.end || filters.end
        }, currentRepo);
    
    if (filtered) {
          console.log('[Dashboard] Filtered data updated', {
            jobStatsCount: filtered.jobStats?.length || 0
          });
          
          setData(prev => ({
        ...filtered,
            workflows: prev?.workflows || availableFilters.workflows,
            branches: prev?.branches || availableFilters.branches,
            actors: prev?.actors || availableFilters.actors
          }));
        }
      }
    };
    
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    // Check initial state
    chrome.storage.local.get(['wsStatus'], (result) => {
      const status = result.wsStatus || {};
      if (status) {
        setProgress({
          items: (status.collectedRuns !== undefined && status.collectedRuns !== null) 
            ? status.collectedRuns 
            : 0, // Current collected count
          complete: status.isComplete || false,
          isStreaming: status.isStreaming || false,
          phase: status.phase || 'workflow_runs',
          totalRuns: status.totalRuns || 0, // Total count from API
          elapsed_time: status.elapsed_time || null,
          eta_seconds: status.eta_seconds || null,
          phase1_elapsed: status.phase1_elapsed || null,
          phase2_elapsed: status.phase2_elapsed || null,
          phase2_eta: status.phase2_eta || null
        });
      }
    });
    
    return () => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }, [currentRepo, filters, availableFilters]);
  
  // Real-time elapsed time counter (updates every second)
  useEffect(() => {
    if (progress.isStreaming) {
      elapsedIntervalRef.current = setInterval(() => {
        if (progress.phase === 'workflow_runs' && phase1StartTime) {
          const elapsed = (Date.now() - phase1StartTime) / 1000;
          setLocalElapsed(elapsed);
        } else if (progress.phase === 'jobs' && phase2StartTime) {
          // Phase 2: count up from when phase2 started
          const elapsed = (Date.now() - phase2StartTime) / 1000;
          setLocalElapsed(elapsed);
        }
      }, 1000);
    } else {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
        elapsedIntervalRef.current = null;
      }
      // Only reset if we're not in Phase 2 (keep Phase 2 elapsed visible until complete)
      if (progress.phase !== 'jobs') {
        setLocalElapsed(0);
      }
    }
    
    return () => {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
      }
    };
  }, [progress.isStreaming, progress.phase, phase1StartTime, phase2StartTime]);

  // Apply ALL filters (including date) when any filter changes (works during collection too)
  // This ensures real-time filtering as data streams in
  useEffect(() => {
    const datesChanged = prevDatesRef.current.start !== filters.start || 
                         prevDatesRef.current.end !== filters.end;
    
    // Update ref if dates changed
    if (datesChanged) {
      prevDatesRef.current = { start: filters.start, end: filters.end };
    }
    
    // Re-apply all filters if we have a repo (works during collection too)
    // filterRunsLocally reads from _runsByRepo which contains all runs collected so far
    // Use dateFiltersRef to get the latest date values (preserved during collection)
    if (currentRepo) {
      const filtered = filterRunsLocally({
        workflow: filters.workflow,
        branch: filters.branch,
        actor: filters.actor,
        startDate: dateFiltersRef.current.start || filters.start,
        endDate: dateFiltersRef.current.end || filters.end
      }, currentRepo);
      
      if (filtered) {
        setData(prev => ({
          ...filtered,
          workflows: prev?.workflows || availableFilters.workflows,
          branches: prev?.branches || availableFilters.branches,
          actors: prev?.actors || availableFilters.actors
        }));
      }
    }
  }, [filters.start, filters.end, filters.workflow, filters.branch, filters.actor, currentRepo]);

  // Note: All filter changes (workflow, branch, actor, date) are now handled
  // in the single useEffect above to avoid duplicate filtering

  // Show start collection button if collection hasn't started yet
  if (!collectionStarted && !loading && !data) {
    return (
      <div className="dashboard dark container">
        <div style={{ textAlign: 'center', padding: '60px 40px' }}>
          <h2 style={{ marginBottom: '20px', color: '#fff' }}>GitHub Actions Dashboard</h2>
          <p style={{ marginBottom: '30px', color: '#ccc', fontSize: '16px' }}>
            Ready to collect workflow run data for <strong style={{ color: '#4caf50' }}>{currentRepo || 'this repository'}</strong>
          </p>
          <p style={{ marginBottom: '40px', color: '#999', fontSize: '14px' }}>
            Click the button below to start collecting all workflow runs from GitHub.
            <br />
            This will fetch all available runs regardless of the date filters shown.
          </p>
          <button 
            className="primary-button" 
            onClick={loadDashboardData}
            style={{
              padding: '16px 32px',
              fontSize: '18px',
              fontWeight: '600',
              background: 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
              transition: 'all 0.3s ease',
              minWidth: '200px'
            }}
            onMouseOver={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.5)';
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.4)';
            }}
          >
            🚀 Start Data Collection
          </button>
        </div>
      </div>
    );
  }

  if (loading && !data && collectionStarted) {
    return (
      <div className="dashboard dark container">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner" style={{ 
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #2196f3',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }
  
  if (error) return (
    <div className="dashboard dark container">
      <div className="card" style={{
        borderLeft: '4px solid #f44336',
        background: 'linear-gradient(90deg, rgba(244,67,54,0.1) 0%, rgba(244,67,54,0.05) 100%)',
        padding: '16px 20px',
        marginTop: '16px'
      }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#ff867c' }}>Connection Error</h3>
        <p style={{ margin: 0, color: '#ffd0cc' }}>
          {error}
        </p>
        <div style={{ marginTop: '12px' }}>
          <button className="primary-button" onClick={loadDashboardData}>Retry</button>
        </div>
      </div>
    </div>
  );
  // If no data and collection hasn't started, show button (already handled above)
  // If no data but collection has started, show loading or error (already handled above)
  // If we have data, continue to render dashboard
  if (!data) {
    // This should not be reached if button logic is correct, but as fallback:
    if (!collectionStarted) {
      return (
        <div className="dashboard dark container">
          <div style={{ textAlign: 'center', padding: '60px 40px' }}>
            <h2 style={{ marginBottom: '20px', color: '#fff' }}>GitHub Actions Dashboard</h2>
            <p style={{ marginBottom: '30px', color: '#ccc', fontSize: '16px' }}>
              Ready to collect workflow run data for <strong style={{ color: '#4caf50' }}>{currentRepo || 'this repository'}</strong>
            </p>
            <button 
              className="primary-button" 
              onClick={loadDashboardData}
              style={{
                padding: '16px 32px',
                fontSize: '18px',
                fontWeight: '600',
                background: 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
                transition: 'all 0.3s ease',
                minWidth: '200px'
              }}
            >
              🚀 Start Data Collection
            </button>
          </div>
        </div>
      );
    }
    return null;
  }
  
  if (data.noData) return <div className="dashboard dark container" style={{ textAlign: 'center', padding: '2rem' }}>
    <h2>No Data Available</h2>
    <p>{data.message}</p>
  </div>;

  const { 
    runsOverTime = [], 
    statusBreakdown = [], 
    branchComparison = [],
    workflowStats = [],
    jobStats = [],
    branchStatsGrouped = [],
    eventStats = [],
    contributorStats = [],
    timeToFix = [],
    topFailedWorkflows = [],
    failureDurationOverTime = [],
    rawRuns = []
  } = data;
  
  const { workflows, branches, actors } = availableFilters;
  
  const totalStatus = statusBreakdown.reduce((sum, s) => sum + (s.value || 0), 0);
  const statusData = statusBreakdown.map(s => ({
    ...s,
    percent: totalStatus ? Math.round((s.value / totalStatus) * 100) : 0
  }));
  
  // ============================================
  // Event Handlers
  // ============================================

  const handleFilterChange = (filterType, value) => {
    if (filterType === 'start' || filterType === 'end') {
      const currentDefaults = getCurrentDefaults();
      const nowStr = currentDefaults.defaultEnd;
      let newStart = filterType === 'start' ? value : filters.start;
      let newEnd = filterType === 'end' ? value : filters.end;

      if (newStart > nowStr) newStart = nowStr;
      if (newEnd > nowStr) newEnd = nowStr;

      if (newStart > newEnd) {
        newEnd = newStart;
      } else if (newEnd < newStart) {
        newStart = newEnd;
      }

      // Update both state and ref to preserve dates during collection
      dateFiltersRef.current = { start: newStart, end: newEnd };
      setFilters(prev => ({ ...prev, start: newStart, end: newEnd }));
      return;
    }

    setFilters(prev => ({ ...prev, [filterType]: value }));
  };

  const toggleCheckbox = (filterType, value, checked) => {
    setFilters(prev => {
      const prevVals = Array.isArray(prev[filterType]) ? prev[filterType] : ['all'];

      let newVals = [];
      if (value === 'all') {
        newVals = checked ? ['all'] : [];
      } else {
        if (checked) {
          newVals = Array.from(new Set([...prevVals.filter(v => v !== 'all'), value]));
        } else {
          newVals = prevVals.filter(v => v !== value && v !== 'all');
        }
      }

      if (!newVals || newVals.length === 0) newVals = ['all'];
      return { ...prev, [filterType]: newVals };
    });
  };

  // Helper function for duration explosion chart
  const getDurationExplosionData = (workflowName) => {
    if (!rawRuns || rawRuns.length === 0) return [];
    
    let filteredRuns = rawRuns;
    if (workflowName !== 'all') {
      filteredRuns = rawRuns.filter(r => r.workflow_name === workflowName);
    }
    
    // Calculate median for the selected workflow(s)
    const durations = filteredRuns.map(r => r.duration || 0).filter(d => d > 0);
    const sorted = [...durations].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const threshold = median * 2;
    
    // Group by date and calculate stats
    const byDate = {};
    filteredRuns.forEach(run => {
      const date = run.created_at ? run.created_at.split('T')[0] : 'Unknown';
      if (!byDate[date]) {
        byDate[date] = { durations: [], explosions: [] };
      }
      byDate[date].durations.push(run.duration || 0);
      if (run.duration > threshold) {
        byDate[date].explosions.push({
          duration: run.duration,
          html_url: run.html_url,
          created_at: run.created_at
        });
      }
    });
    
    return Object.entries(byDate)
      .map(([date, data]) => ({
        date,
        duration: data.durations.reduce((a, b) => a + b, 0) / data.durations.length,
        median,
        threshold,
        explosions: data.explosions
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Helper function for failure worsening chart
  const getFailureWorseningData = () => {
    if (!rawRuns || rawRuns.length === 0) return [];
    
    // Group by date
    const byDate = {};
    rawRuns.forEach(run => {
      const date = run.created_at ? run.created_at.split('T')[0] : 'Unknown';
      if (!byDate[date]) {
        byDate[date] = { runs: [] };
      }
      byDate[date].runs.push(run);
    });
    
    // Calculate failure rate per date and detect worsening
    const windowSize = 10;
    const threshold = 0.5; // 50%
    
    return Object.entries(byDate)
      .map(([date, data]) => {
        const total = data.runs.length;
        const failures = data.runs.filter(r => r.conclusion === 'failure').length;
        const failureRate = total > 0 ? failures / total : 0;
        
        return {
          date,
          failureRate: failureRate * 100,
          threshold: threshold * 100,
          total,
          failures,
          worsening: failureRate > threshold ? failureRate * 100 : 0,
          firstFailureUrl: failures > 0 ? data.runs.find(r => r.conclusion === 'failure')?.html_url : null
        };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  // Custom Box Plot Component
  const BoxPlot = ({ data, x, y, width, height, min, q1, median, q3, max, mean }) => {
    const boxHeight = height * 0.6;
    const boxY = y - boxHeight / 2;
    const whiskerLength = width * 0.3;
    
    return (
      <g>
        {/* Whiskers (min to Q1, Q3 to max) */}
        <line x1={x} y1={y} x2={x} y2={y - height / 2} stroke="#fff" strokeWidth={1} />
        <line x1={x} y1={y} x2={x} y2={y + height / 2} stroke="#fff" strokeWidth={1} />
        <line x1={x - whiskerLength} y1={y - height / 2} x2={x + whiskerLength} y2={y - height / 2} stroke="#fff" strokeWidth={1} />
        <line x1={x - whiskerLength} y1={y + height / 2} x2={x + whiskerLength} y2={y + height / 2} stroke="#fff" strokeWidth={1} />
        
        {/* Box (Q1 to Q3) */}
        <rect 
          x={x - width / 2} 
          y={boxY} 
          width={width} 
          height={boxHeight} 
          fill="#2196f3" 
          stroke="#fff" 
          strokeWidth={1}
          opacity={0.7}
        />
        
        {/* Median line */}
        <line 
          x1={x - width / 2} 
          y1={y} 
          x2={x + width / 2} 
          y2={y} 
          stroke="#ff9800" 
          strokeWidth={2} 
        />
        
        {/* Mean marker */}
        <circle 
          cx={x} 
          cy={y} 
          r={3} 
          fill="#4caf50" 
          stroke="#fff" 
          strokeWidth={1}
        />
      </g>
    );
  };

  // Format time-to-fix data for visualization
  const formatTimeToFixForBoxPlot = (timeToFixData) => {
    if (!timeToFixData || timeToFixData.length === 0) return [];
    
    // Calculate scale for positioning boxes
    const allMax = Math.max(...timeToFixData.map(d => d.max || 0));
    const scale = allMax > 0 ? 1 : 1;
    
    return timeToFixData.map((item, index) => ({
      workflow: item.workflow,
      index: index,
      min: item.min || 0,
      q1: item.q1 || 0,
      median: item.median || 0,
      q3: item.q3 || 0,
      max: item.max || 0,
      mean: item.mean || 0,
      count: item.count || 0,
      // For visualization, we'll use the median as the main value
      value: item.median || 0
    }));
  };

  return (
    <div className="dashboard dark">
      <div className="container">
        {/* Streaming indicator */}
        {progress.isStreaming && (
          <div style={{ 
            padding: '15px 20px', 
            background: progress.phase === 'workflow_runs' 
              ? 'linear-gradient(90deg, #2196f3 0%, #1976d2 100%)' 
              : 'linear-gradient(90deg, #ff9800 0%, #f44336 100%)',
            color: 'white',
            borderRadius: '8px',
            marginBottom: '20px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
          }}>
            {/* First row: Spinner and collecting text */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="spinner" style={{ 
                border: '3px solid rgba(255,255,255,0.3)',
                borderTop: '3px solid white',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                animation: 'spin 1s linear infinite'
              }}></div>
                <span style={{ fontWeight: 600 }}>
                  {progress.phase === 'workflow_runs' ? 'Collecting workflow runs...' : 'Collecting job details...'}
                </span>
            </div>
              {/* Progress: X / Total */}
            <span style={{ 
              background: 'rgba(255,255,255,0.2)', 
              padding: '4px 12px', 
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 700
            }}>
                {progress.phase === 'workflow_runs' 
                  ? `${progress.items} / ${progress.totalRuns || '?'} runs`
                  : `${jobProgress.runs_processed || 0} / ${jobProgress.total_runs || 0} runs (${jobProgress.jobs_collected || 0} jobs)`}
            </span>
            </div>
            
            {/* Second row: Time elapsed and ETA (under the collecting text) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px', fontWeight: 500, paddingLeft: '32px' }}>
              {progress.phase === 'workflow_runs' ? (
                <>
                  <span>Time Elapsed: <strong>{formatDuration(localElapsed || progress.elapsed_time || 0)}</strong></span>
                  {progress.eta_seconds && (
                    <span>ETA: <strong>{formatDuration(progress.eta_seconds)}</strong></span>
                  )}
                </>
              ) : (
                <>
                  {progress.phase1_elapsed && (
                    <span>Phase 1 Elapsed: <strong>{formatDuration(progress.phase1_elapsed)}</strong></span>
                  )}
                  <span>Phase 2 Elapsed: <strong>{formatDuration(localElapsed || 0)}</strong></span>
                  {progress.phase1_elapsed && (
                    <span>Total Elapsed: <strong>{formatDuration((progress.phase1_elapsed || 0) + (localElapsed || 0))}</strong></span>
                  )}
                  {progress.phase2_eta && (
                    <span>ETA: <strong>{formatDuration(progress.phase2_eta)}</strong></span>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <h2 style={{ marginTop: 0 }}>GitHub Actions Dashboard</h2>
        
        {/* Filter Panel */}
        <div className="filter-panel card">
          <div className="filter-row">
            {/* Workflow */}
            <div className="filter-group">
              <label>Workflow</label>
              <div className="dropdown-container" ref={dropdownRefs.workflow}>
                <button
                  className="dropdown-toggle"
                  onClick={() => setOpenDropdowns(prev => ({
                    workflow: !prev.workflow,
                    branch: false,
                    actor: false
                  }))}
                >
                  {filters.workflow.includes('all') ? 'All workflows' : `${filters.workflow.length} selected`}
                  <span className="dropdown-arrow">▼</span>
                </button>
                {openDropdowns.workflow && (
                  <div className="dropdown-menu">
                    <label className="dropdown-item">
                      <input
                        type="checkbox"
                        checked={filters.workflow.includes('all')}
                        onChange={(e) => toggleCheckbox('workflow', 'all', e.target.checked)}
                      />
                      <span>All workflows</span>
                    </label>
                    {workflows.filter(w => w !== 'all').map(w => (
                      <label key={w} className="dropdown-item">
                        <input
                          type="checkbox"
                          checked={filters.workflow.includes(w)}
                          onChange={(e) => toggleCheckbox('workflow', w, e.target.checked)}
                        />
                        <span>{w}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Branch */}
            <div className="filter-group">
              <label>Branch</label>
              <div className="dropdown-container" ref={dropdownRefs.branch}>
                <button
                  className="dropdown-toggle"
                  onClick={() => setOpenDropdowns(prev => ({
                    workflow: false,
                    branch: !prev.branch,
                    actor: false
                  }))}
                >
                  {filters.branch.includes('all') ? 'All branches' : `${filters.branch.length} selected`}
                  <span className="dropdown-arrow">▼</span>
                </button>
                {openDropdowns.branch && (
                  <div className="dropdown-menu">
                    <label className="dropdown-item">
                      <input
                        type="checkbox"
                        checked={filters.branch.includes('all')}
                        onChange={(e) => toggleCheckbox('branch', 'all', e.target.checked)}
                      />
                      <span>All branches</span>
                    </label>
                    {branches.filter(b => b !== 'all').map(b => (
                      <label key={b} className="dropdown-item">
                        <input
                          type="checkbox"
                          checked={filters.branch.includes(b)}
                          onChange={(e) => toggleCheckbox('branch', b, e.target.checked)}
                        />
                        <span>{b}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actor */}
            <div className="filter-group">
              <label>Actor</label>
              <div className="dropdown-container" ref={dropdownRefs.actor}>
                <button
                  className="dropdown-toggle"
                  onClick={() => setOpenDropdowns(prev => ({
                    workflow: false,
                    branch: false,
                    actor: !prev.actor
                  }))}
                >
                  {filters.actor.includes('all') ? 'All actors' : `${filters.actor.length} selected`}
                  <span className="dropdown-arrow">▼</span>
                </button>
                {openDropdowns.actor && (
                  <div className="dropdown-menu">
                    <label className="dropdown-item">
                      <input
                        type="checkbox"
                        checked={filters.actor.includes('all')}
                        onChange={(e) => toggleCheckbox('actor', 'all', e.target.checked)}
                      />
                      <span>All actors</span>
                    </label>
                    {actors.filter(a => a !== 'all').map(a => (
                      <label key={a} className="dropdown-item">
                        <input
                          type="checkbox"
                          checked={filters.actor.includes(a)}
                          onChange={(e) => toggleCheckbox('actor', a, e.target.checked)}
                        />
                        <span>{a}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Date Range Picker */}
            <div className="filter-group" ref={datePickerRef} style={{ position: 'relative' }}>
              <label>Date Range</label>
              <button
                onClick={() => setDatePickerOpen(!datePickerOpen)}
                style={{
                  width: '100%',
                  padding: '10px 15px',
                  background: '#222',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.target.style.background = '#2a2a2a';
                  e.target.style.borderColor = '#555';
                }}
                onMouseOut={(e) => {
                  e.target.style.background = '#222';
                  e.target.style.borderColor = '#444';
                }}
              >
                <span>
                  {filters.start && filters.end 
                    ? `${new Date(filters.start).toLocaleDateString()} - ${new Date(filters.end).toLocaleDateString()}`
                    : 'Select date range...'}
                </span>
                <span style={{ fontSize: '12px', opacity: 0.7 }}>▼</span>
              </button>
              
              {datePickerOpen && (() => {
                const handleSetDates = (startDate, endDate) => {
                  const startStr = formatDateForInput(startDate);
                  const endStr = formatDateForInput(endDate);
                  // Update both state and ref to preserve dates during collection
                  dateFiltersRef.current = { start: startStr, end: endStr };
                  setFilters(prev => ({ ...prev, start: startStr, end: endStr }));
                };

                const handleDateClick = (day) => {
                  const clickedDate = new Date(calendarYear, calendarMonth, day);
                  const clickedDateStr = formatDateForInput(clickedDate);
                  
                  if (selectingStart || !filters.start || clickedDateStr < filters.start) {
                    handleSetDates(clickedDate, clickedDate);
                    setSelectingStart(false);
                  } else {
                    handleSetDates(parseDateStr(filters.start), clickedDate);
                    setSelectingStart(true);
                  }
                };

                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
                const firstDay = getFirstDayOfMonth(calendarYear, calendarMonth);
                const today = new Date();
                const selectedStart = filters.start ? parseDateStr(filters.start) : null;
                const selectedEnd = filters.end ? parseDateStr(filters.end) : null;

                // Generate calendar grid
                const calendarDays = [];
                for (let i = 0; i < firstDay; i++) {
                  calendarDays.push(null);
                }
                for (let day = 1; day <= daysInMonth; day++) {
                  calendarDays.push(day);
                }

                return (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '5px',
                    background: '#1a1a1a',
                    border: '1px solid #444',
                    borderRadius: '12px',
                    padding: '20px',
                    zIndex: 1000,
                    width: '340px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
                  }}>
                    {/* Quick Action Buttons */}
                    <div style={{ marginBottom: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const now = new Date();
                          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                          const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                          handleSetDates(firstDay, lastDay);
                        }}
                        style={{
                          padding: '8px 14px',
                          background: '#4caf50',
                          border: 'none',
                          borderRadius: '6px',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => e.target.style.background = '#45a049'}
                        onMouseOut={(e) => e.target.style.background = '#4caf50'}
                      >
                        Current Month
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const now = new Date();
                          const firstDay = new Date(now.getFullYear(), 0, 1);
                          const lastDay = new Date(now.getFullYear(), 11, 31);
                          handleSetDates(firstDay, lastDay);
                        }}
                        style={{
                          padding: '8px 14px',
                          background: '#2196f3',
                          border: 'none',
                          borderRadius: '6px',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => e.target.style.background = '#1976d2'}
                        onMouseOut={(e) => e.target.style.background = '#2196f3'}
                      >
                        Current Year
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const farPast = new Date(2000, 0, 1);
                          const farFuture = new Date(2100, 0, 1);
                          handleSetDates(farPast, farFuture);
                        }}
                        style={{
                          padding: '8px 14px',
                          background: '#ff9800',
                          border: 'none',
                          borderRadius: '6px',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => e.target.style.background = '#f57c00'}
                        onMouseOut={(e) => e.target.style.background = '#ff9800'}
                      >
                        All Time
                      </button>
            </div>

                    {/* Calendar Header - Month/Year Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (calendarMonth === 0) {
                            setCalendarMonth(11);
                            setCalendarYear(calendarYear - 1);
                          } else {
                            setCalendarMonth(calendarMonth - 1);
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid #444',
                          borderRadius: '6px',
                          color: '#fff',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          fontSize: '14px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => { e.target.style.background = '#2a2a2a'; e.target.style.borderColor = '#666'; }}
                        onMouseOut={(e) => { e.target.style.background = 'transparent'; e.target.style.borderColor = '#444'; }}
                      >
                        ←
                      </button>
                      <div style={{ color: '#fff', fontSize: '16px', fontWeight: '600' }}>
                        {monthNames[calendarMonth]} {calendarYear}
            </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (calendarMonth === 11) {
                            setCalendarMonth(0);
                            setCalendarYear(calendarYear + 1);
                          } else {
                            setCalendarMonth(calendarMonth + 1);
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid #444',
                          borderRadius: '6px',
                          color: '#fff',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          fontSize: '14px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => { e.target.style.background = '#2a2a2a'; e.target.style.borderColor = '#666'; }}
                        onMouseOut={(e) => { e.target.style.background = 'transparent'; e.target.style.borderColor = '#444'; }}
                      >
                        →
                      </button>
          </div>

                    {/* Calendar Grid */}
                    <div style={{ marginBottom: '15px' }}>
                      {/* Day Headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                        {dayNames.map(day => (
                          <div key={day} style={{ textAlign: 'center', color: '#888', fontSize: '12px', fontWeight: '600', padding: '8px 0' }}>
                            {day}
                          </div>
                        ))}
                      </div>
                      {/* Calendar Days */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                        {calendarDays.map((day, idx) => {
                          if (day === null) {
                            return <div key={`empty-${idx}`} style={{ height: '36px' }}></div>;
                          }
                          const cellDate = new Date(calendarYear, calendarMonth, day);
                          const cellDateStr = formatDateForInput(cellDate);
                          const isToday = isSameDay(cellDate, today);
                          const isStart = selectedStart && isSameDay(cellDate, selectedStart);
                          const isEnd = selectedEnd && isSameDay(cellDate, selectedEnd);
                          const isInRange = selectedStart && selectedEnd && isDateInRange(cellDate, filters.start, filters.end);
                          const isSelected = isStart || isEnd;

                          return (
                            <button
                              key={day}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDateClick(day);
                              }}
                              style={{
                                height: '36px',
                                background: isSelected ? '#4caf50' : isInRange ? 'rgba(76, 175, 80, 0.2)' : isToday ? 'rgba(33, 150, 243, 0.2)' : 'transparent',
                                border: isToday ? '1px solid #2196f3' : isSelected ? '1px solid #4caf50' : '1px solid transparent',
                                borderRadius: '6px',
                                color: isSelected ? '#fff' : isToday ? '#2196f3' : '#fff',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: isSelected || isToday ? '600' : '400',
                                transition: 'all 0.2s ease',
                                position: 'relative'
                              }}
                              onMouseOver={(e) => {
                                if (!isSelected) {
                                  e.target.style.background = isInRange ? 'rgba(76, 175, 80, 0.3)' : '#2a2a2a';
                                  e.target.style.borderColor = '#555';
                                }
                              }}
                              onMouseOut={(e) => {
                                if (!isSelected) {
                                  e.target.style.background = isInRange ? 'rgba(76, 175, 80, 0.2)' : 'transparent';
                                  e.target.style.borderColor = isToday ? '#2196f3' : 'transparent';
                                }
                              }}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Range Display */}
                    <div style={{ 
                      padding: '12px', 
                      background: '#222', 
                      borderRadius: '6px', 
                      marginBottom: '15px',
                      fontSize: '13px',
                      color: '#ccc'
                    }}>
                      <div><strong>From:</strong> {selectedStart ? formatDateDisplay(filters.start) : 'Not selected'}</div>
                      <div style={{ marginTop: '4px' }}><strong>To:</strong> {selectedEnd ? formatDateDisplay(filters.end) : 'Not selected'}</div>
                    </div>

                    {/* Close Button */}
                    <div style={{ textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDatePickerOpen(false);
                        }}
                        style={{
                          padding: '8px 20px',
                          background: '#333',
                          border: '1px solid #555',
                          borderRadius: '6px',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.target.style.background = '#444';
                          e.target.style.borderColor = '#666';
                        }}
                        onMouseOut={(e) => {
                          e.target.style.background = '#333';
                          e.target.style.borderColor = '#555';
                        }}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card card">
            <div className="title">Total runs</div>
            <div className="value">{data.originalTotalRuns !== undefined ? data.originalTotalRuns : data.totalRuns}</div>
          </div>
          <div className="stat-card card">
            <div className="title">Success rate</div>
            <div className="value">{`${(data.successRate * 100).toFixed(1)}%`}</div>
          </div>
          <div className="stat-card card">
            <div className="title">Median duration</div>
            <div className="value">{`${data.medianDuration} s`}</div>
          </div>
          <div className="stat-card card">
            <div className="title">MAD (Median Absolute Deviation)</div>
            <div className="value">{`${data.mad} s`}</div>
          </div>
        </div>

        {/* Charts */}
        <div className="dashboard-grid">
          {/* Statistics Container with Tabs */}
          <div className="card" style={{ width: '100%', gridColumn: '1 / -1' }}>
            <h3>Statistics</h3>
            <div style={{ marginBottom: '20px', borderBottom: '1px solid #333' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setActiveStatsTab('workflows')}
                  style={{
                    padding: '10px 20px',
                    background: activeStatsTab === 'workflows' ? '#4caf50' : '#222',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: '4px 4px 0 0'
                  }}
                >
                  Workflows
                </button>
                <button
                  onClick={() => setActiveStatsTab('jobs')}
                  style={{
                    padding: '10px 20px',
                    background: activeStatsTab === 'jobs' ? '#4caf50' : '#222',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: '4px 4px 0 0'
                  }}
                >
                  Jobs
                </button>
                <button
                  onClick={() => setActiveStatsTab('branch')}
                  style={{
                    padding: '10px 20px',
                    background: activeStatsTab === 'branch' ? '#4caf50' : '#222',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: '4px 4px 0 0'
                  }}
                >
                  Branch
                </button>
                <button
                  onClick={() => setActiveStatsTab('events')}
                  style={{
                    padding: '10px 20px',
                    background: activeStatsTab === 'events' ? '#4caf50' : '#222',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: '4px 4px 0 0'
                  }}
                >
                  Event Triggers
                </button>
                <button
                  onClick={() => setActiveStatsTab('contributors')}
                  style={{
                    padding: '10px 20px',
                    background: activeStatsTab === 'contributors' ? '#4caf50' : '#222',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: '4px 4px 0 0'
                  }}
                >
                  Contributors
                </button>
              </div>
            </div>
            
            {activeStatsTab === 'workflows' && (
              <div className="table-wrapper">
                <table className="branch-table">
                  <thead>
                    <tr>
                      <th>Workflow</th>
                      <th>Total Runs</th>
                      <th>Failures</th>
                      <th>Skipped</th>
                      <th>Cancelled</th>
                      <th>Timeout</th>
                      <th>Success/Failure</th>
                      <th>Median Duration</th>
                      <th>Total Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflowStats.map(w => {
                      const successRate = w.totalRuns > 0 ? (w.successes / w.totalRuns) * 100 : 0;
                      const failureRate = w.totalRuns > 0 ? (w.failures / w.totalRuns) * 100 : 0;
                      return (
                        <tr key={w.name}>
                          <td className="branch-name">{w.name}</td>
                          <td>{w.totalRuns}</td>
                          <td>{w.failures}</td>
                          <td>{w.skipped}</td>
                          <td>{w.cancelled}</td>
                          <td>{w.timeout}</td>
                          <td>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              minWidth: '150px'
                            }}>
                              <div style={{
                                flex: 1,
                                height: '20px',
                                background: '#333',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                display: 'flex'
                              }}>
                                <div style={{
                                  width: `${successRate}%`,
                                  background: '#4caf50',
                                  height: '100%'
                                }}></div>
                                <div style={{
                                  width: `${failureRate}%`,
                                  background: '#f44336',
                                  height: '100%'
                                }}></div>
                              </div>
                              <span style={{ fontSize: '12px', color: '#ccc', minWidth: '45px' }}>
                                {successRate.toFixed(0)}%/{failureRate.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td>{w.medianDuration}s</td>
                          <td>{w.totalDuration}s</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            
            {activeStatsTab === 'jobs' && (() => {
              return (
                <div className="table-wrapper">
                {/* Show progress while collecting jobs (Phase 2) */}
                {jobProgress.isCollecting && jobProgress.total_runs > 0 && (
                  <div style={{
                    padding: '15px',
                    marginBottom: jobStats.length > 0 ? '15px' : '0',
                    background: '#2a2a2a',
                    borderRadius: '6px',
                    border: '1px solid #444',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '15px'
                  }}>
                    <div className="spinner"></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                        Collecting job data...
                      </div>
                      <div style={{ color: '#aaa', fontSize: '12px', marginBottom: '8px' }}>
                        {jobProgress.runs_processed} / {jobProgress.total_runs} runs processed ({jobProgress.jobs_collected} jobs collected)
                      </div>
                      <div style={{
                        height: '4px',
                        background: '#333',
                        borderRadius: '2px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${(jobProgress.runs_processed / jobProgress.total_runs) * 100}%`,
                          height: '100%',
                          background: '#4caf50',
                          transition: 'width 0.3s ease'
                        }}></div>
                      </div>
                    </div>
                  </div>
                )}
                {/* No data message */}
                {jobStats.length === 0 && !jobProgress.isCollecting && !progress.isStreaming && (
                  <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#999'
                  }}>
                    No job data available. Start data collection to see job statistics.
                  </div>
                )}
                {jobStats.length > 0 && (
                  <table className="branch-table">
                    <thead>
                      <tr>
                        <th>Job</th>
                        <th>Workflow</th>
                        <th>Total Runs</th>
                        <th>Failures</th>
                        <th>Skipped</th>
                        <th>Cancelled</th>
                        <th>Timeout</th>
                        <th>Success/Failure</th>
                        <th>Median Duration</th>
                        <th>Total Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobStats.map(j => {
                        const successCount = j.totalRuns - j.failures - j.skipped - j.cancelled - j.timeout;
                        const successRate = j.totalRuns > 0 ? (successCount / j.totalRuns) * 100 : 0;
                        const failureRate = j.totalRuns > 0 ? (j.failures / j.totalRuns) * 100 : 0;
                        return (
                          <tr key={j.name}>
                            <td className="branch-name">{j.name}</td>
                            <td style={{ color: '#bbb', fontSize: '13px' }}>{j.workflowName || 'unknown'}</td>
                            <td>{j.totalRuns}</td>
                            <td>{j.failures}</td>
                            <td>{j.skipped}</td>
                            <td>{j.cancelled}</td>
                            <td>{j.timeout}</td>
                            <td>
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                minWidth: '150px'
                              }}>
                                <div style={{
                                  flex: 1,
                                  height: '20px',
                                  background: '#333',
                                  borderRadius: '4px',
                                  overflow: 'hidden',
                                  display: 'flex'
                                }}>
                                  <div style={{
                                    width: `${successRate}%`,
                                    background: '#4caf50',
                                    height: '100%'
                                  }}></div>
                                  <div style={{
                                    width: `${failureRate}%`,
                                    background: '#f44336',
                                    height: '100%'
                                  }}></div>
                                </div>
                                <span style={{ fontSize: '12px', color: '#ccc', minWidth: '45px' }}>
                                  {successRate.toFixed(0)}%/{failureRate.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td>{j.medianDuration}s</td>
                            <td>{j.totalDuration}s</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                </div>
              );
            })()}
            
            {activeStatsTab === 'branch' && (
              <div>
                <div style={{ marginBottom: '15px', borderBottom: '1px solid #333' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => setActiveBranchEventTab('all')}
                      style={{
                        padding: '8px 16px',
                        background: activeBranchEventTab === 'all' ? '#2196f3' : '#222',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: '4px'
                      }}
                    >
                      All Events
                    </button>
                    {eventStats.map(e => (
                      <button
                        key={e.name}
                        onClick={() => setActiveBranchEventTab(e.name)}
                        style={{
                          padding: '8px 16px',
                          background: activeBranchEventTab === e.name ? '#2196f3' : '#222',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          borderRadius: '4px'
                        }}
                      >
                        {e.name}
                      </button>
                    ))}
          </div>
                </div>
            <div className="table-wrapper">
              <table className="branch-table">
                <thead>
                  <tr>
                        <th>Branch Group</th>
                        <th>Total Runs</th>
                    <th>Failures</th>
                        <th>Skipped</th>
                        <th>Cancelled</th>
                        <th>Timeout</th>
                        <th>Success/Failure</th>
                        <th>Median Duration</th>
                        <th>Total Duration</th>
                  </tr>
                </thead>
                <tbody>
                      {(activeBranchEventTab === 'all' 
                        ? branchStatsGrouped 
                        : branchStatsGrouped.filter(b => {
                            // Filter branch stats by event - this would need to be calculated in websocket.js
                            // For now, show all branch stats
                            return true;
                          })
                      ).map(b => {
                        const successCount = b.totalRuns - b.failures - b.skipped - b.cancelled - b.timeout;
                        const successRate = b.totalRuns > 0 ? (successCount / b.totalRuns) * 100 : 0;
                        const failureRate = b.totalRuns > 0 ? (b.failures / b.totalRuns) * 100 : 0;
                        return (
                          <tr key={b.name}>
                            <td className="branch-name">{b.name}</td>
                      <td>{b.totalRuns}</td>
                            <td>{b.failures}</td>
                            <td>{b.skipped}</td>
                            <td>{b.cancelled}</td>
                            <td>{b.timeout}</td>
                            <td>
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                minWidth: '150px'
                              }}>
                                <div style={{
                                  flex: 1,
                                  height: '20px',
                                  background: '#333',
                                  borderRadius: '4px',
                                  overflow: 'hidden',
                                  display: 'flex'
                                }}>
                                  <div style={{
                                    width: `${successRate}%`,
                                    background: '#4caf50',
                                    height: '100%'
                                  }}></div>
                                  <div style={{
                                    width: `${failureRate}%`,
                                    background: '#f44336',
                                    height: '100%'
                                  }}></div>
                                </div>
                                <span style={{ fontSize: '12px', color: '#ccc', minWidth: '45px' }}>
                                  {successRate.toFixed(0)}%/{failureRate.toFixed(0)}%
                                </span>
                              </div>
                      </td>
                      <td>{b.medianDuration}s</td>
                            <td>{b.totalDuration}s</td>
                    </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </div>
            )}
            
            {activeStatsTab === 'events' && (
              <div className="table-wrapper">
                <table className="branch-table">
                  <thead>
                    <tr>
                      <th>Event Trigger</th>
                      <th>Total Runs</th>
                      <th>Failures</th>
                      <th>Skipped</th>
                      <th>Cancelled</th>
                      <th>Timeout</th>
                      <th>Success/Failure</th>
                      <th>Median Duration</th>
                      <th>Total Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventStats.map(e => {
                      const successCount = e.totalRuns - e.failures - e.skipped - e.cancelled - e.timeout;
                      const successRate = e.totalRuns > 0 ? (successCount / e.totalRuns) * 100 : 0;
                      const failureRate = e.totalRuns > 0 ? (e.failures / e.totalRuns) * 100 : 0;
                      return (
                        <tr key={e.name}>
                          <td className="branch-name">{e.name}</td>
                          <td>{e.totalRuns}</td>
                          <td>{e.failures}</td>
                          <td>{e.skipped}</td>
                          <td>{e.cancelled}</td>
                          <td>{e.timeout}</td>
                          <td>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              minWidth: '150px'
                            }}>
                              <div style={{
                                flex: 1,
                                height: '20px',
                                background: '#333',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                display: 'flex'
                              }}>
                                <div style={{
                                  width: `${successRate}%`,
                                  background: '#4caf50',
                                  height: '100%'
                                }}></div>
                                <div style={{
                                  width: `${failureRate}%`,
                                  background: '#f44336',
                                  height: '100%'
                                }}></div>
                              </div>
                              <span style={{ fontSize: '12px', color: '#ccc', minWidth: '45px' }}>
                                {successRate.toFixed(0)}%/{failureRate.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td>{e.medianDuration}s</td>
                          <td>{e.totalDuration}s</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activeStatsTab === 'contributors' && (
              <div>
                {/* Search bar for filtering contributors */}
                <div style={{ marginBottom: '15px' }}>
                  <input
                    type="text"
                    placeholder="Search contributors by name..."
                    value={contributorSearchQuery}
                    onChange={(e) => setContributorSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 15px',
                      background: '#222',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '14px'
                    }}
                  />
                </div>
                
                <div className="table-wrapper">
                  <table className="branch-table">
                    <thead>
                      <tr>
                        <th>Contributor</th>
                        <th>Total Runs</th>
                        <th>Failures</th>
                        <th>Skipped</th>
                        <th>Cancelled</th>
                        <th>Timeout</th>
                        <th>Success/Failure</th>
                        <th>Median Duration</th>
                        <th>Total Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributorStats
                        .filter(c => {
                          if (!contributorSearchQuery.trim()) return true;
                          return c.name.toLowerCase().includes(contributorSearchQuery.toLowerCase());
                        })
                        .map(c => {
                          const successRate = c.totalRuns > 0 ? (c.successes / c.totalRuns) * 100 : 0;
                          const failureRate = c.totalRuns > 0 ? (c.failures / c.totalRuns) * 100 : 0;
                          return (
                            <tr key={c.name}>
                              <td className="branch-name">{c.name}</td>
                              <td>{c.totalRuns}</td>
                              <td>{c.failures}</td>
                              <td>{c.skipped}</td>
                              <td>{c.cancelled}</td>
                              <td>{c.timeout}</td>
                              <td>
                                <div style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '8px',
                                  minWidth: '150px'
                                }}>
                                  <div style={{
                                    flex: 1,
                                    height: '20px',
                                    background: '#333',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    display: 'flex'
                                  }}>
                                    <div style={{
                                      width: `${successRate}%`,
                                      background: '#4caf50',
                                      height: '100%'
                                    }}></div>
                                    <div style={{
                                      width: `${failureRate}%`,
                                      background: '#f44336',
                                      height: '100%'
                                    }}></div>
                                  </div>
                                  <span style={{ fontSize: '12px', color: '#ccc', minWidth: '45px' }}>
                                    {successRate.toFixed(0)}%/{failureRate.toFixed(0)}%
                                  </span>
                                </div>
                              </td>
                              <td>{c.medianDuration}s</td>
                              <td>{c.totalDuration}s</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Daily runs */}
          <div className="card">
            <h3>Daily runs breakdown</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={runsOverTime} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="date" stroke="#bcd" />
                <YAxis stroke="#bcd" />
                <Tooltip />
                <Legend />
                <Bar dataKey="successes" stackId="a" fill="#4caf50" name="Successes" />
                <Bar dataKey="failures" stackId="a" fill="#f44336" name="Failures" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Duration over time */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Duration variability</h3>
              <button
                onClick={() => {
                  setDurationVariabilityZoom(null);
                }}
                style={{
                  padding: '5px 10px',
                  background: durationVariabilityZoom ? '#4caf50' : '#333',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  cursor: durationVariabilityZoom ? 'pointer' : 'default',
                  fontSize: '11px'
                }}
                disabled={!durationVariabilityZoom}
              >
                Reset Zoom
              </button>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart 
                data={runsOverTime} 
                margin={{ top: 10, right: 20, left: 0, bottom: 30 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis 
                  dataKey="date" 
                  stroke="#bcd"
                />
                <YAxis stroke="#bcd" label={{ value: 'Duration (s)', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="maxDuration" fill="#ff980030" stroke="#ff9800" name="Max" />
                <Area type="monotone" dataKey="minDuration" fill="#4caf5030" stroke="#4caf50" name="Min" />
                <Line type="monotone" dataKey="medianDuration" stroke="#2196f3" strokeWidth={3} name="Median" />
                <Brush 
                  dataKey="date" 
                  height={30}
                  stroke="#8884d8"
                  startIndex={durationVariabilityZoom?.startIndex}
                  endIndex={durationVariabilityZoom?.endIndex}
                  onChange={(e) => {
                    if (e && typeof e.startIndex === 'number' && typeof e.endIndex === 'number') {
                      setDurationVariabilityZoom({ startIndex: e.startIndex, endIndex: e.endIndex });
                    } else {
                      setDurationVariabilityZoom(null);
                    }
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Cumulative failure duration */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Cumulative failure duration</h3>
              <button
                onClick={() => {
                  setCumulativeFailureZoom(null);
                }}
                style={{
                  padding: '5px 10px',
                  background: cumulativeFailureZoom ? '#4caf50' : '#333',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  cursor: cumulativeFailureZoom ? 'pointer' : 'default',
                  fontSize: '11px'
                }}
                disabled={!cumulativeFailureZoom}
              >
                Reset Zoom
              </button>
            </div>
            {failureDurationOverTime && failureDurationOverTime.length > 0 && 
             failureDurationOverTime.some(item => (item.dailyFailureDuration || 0) > 0 || (item.cumulativeFailureDuration || 0) > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart 
                  data={failureDurationOverTime} 
                  margin={{ top: 10, right: 20, left: 0, bottom: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#bcd"
                  />
                  <YAxis stroke="#bcd" label={{ value: 'Duration (s)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="dailyFailureDuration" fill="#f44336" name="Daily failure duration" />
                  <Line type="monotone" dataKey="cumulativeFailureDuration" stroke="#ff9800" strokeWidth={2} name="Cumulative" />
                  <Brush 
                    dataKey="date" 
                    height={30}
                    stroke="#8884d8"
                    startIndex={cumulativeFailureZoom?.startIndex}
                    endIndex={cumulativeFailureZoom?.endIndex}
                    onChange={(e) => {
                      if (e && typeof e.startIndex === 'number' && typeof e.endIndex === 'number') {
                        setCumulativeFailureZoom({ startIndex: e.startIndex, endIndex: e.endIndex });
                      } else {
                        setCumulativeFailureZoom(null);
                      }
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                No workflows with failures in the selected period
              </div>
            )}
          </div>

          {/* Time to Fix Box Plot */}
          <div className="card">
            <h3>Time to Fix (Box Plot)</h3>
            {timeToFix && timeToFix.length > 0 ? (
              <div style={{ width: '100%', height: '320px', position: 'relative', overflow: 'hidden' }}>
                {tooltipData && (
                  <div 
                    style={{
                      position: 'fixed',
                      left: tooltipPosition.x + 10,
                      top: tooltipPosition.y + 10,
                      background: '#222',
                      padding: '10px',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      pointerEvents: 'none',
                      zIndex: 1000,
                      color: '#fff',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{tooltipData.workflow}</div>
                    <div>Count: {tooltipData.count}</div>
                    <div>Min: {tooltipData.min}s</div>
                    <div style={{ color: '#2196f3' }}>Q1: {tooltipData.q1}s</div>
                    <div style={{ color: '#ff9800', fontWeight: 'bold' }}>Median: {tooltipData.median}s</div>
                    <div style={{ color: '#2196f3' }}>Q3: {tooltipData.q3}s</div>
                    <div>Max: {tooltipData.max}s</div>
                    <div style={{ color: '#4caf50', fontWeight: 'bold', marginTop: '5px' }}>Mean: {tooltipData.mean}s</div>
                  </div>
                )}
                <svg width="100%" height="100%" viewBox="0 0 900 320" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
                  {(() => {
                    const chartWidth = 900;
                    const chartHeight = 320;
                    const margin = { top: 20, right: 30, bottom: 60, left: 120 };
                    const plotWidth = chartWidth - margin.left - margin.right;
                    const plotHeight = chartHeight - margin.top - margin.bottom;
                    
                    // Handle large values by using 95th percentile or reasonable max
                    const allValues = timeToFix.flatMap(d => [d.min, d.q1, d.median, d.q3, d.max, d.mean].filter(v => v > 0));
                    const sortedValues = [...allValues].sort((a, b) => a - b);
                    const p95Index = Math.floor(sortedValues.length * 0.95);
                    const reasonableMax = sortedValues.length > 0 ? Math.max(sortedValues[p95Index] || sortedValues[sortedValues.length - 1], Math.max(...timeToFix.map(d => d.max || 0)) * 0.1) : 1;
                    
                    const xScale = reasonableMax > 0 ? plotWidth / reasonableMax : 1;
                    const boxSpacing = plotHeight / (timeToFix.length + 1);
                    const boxHeight = Math.min(boxSpacing * 0.6, 40);
                    
                    return (
                      <g transform={`translate(${margin.left}, ${margin.top})`}>
                        {/* Y-axis line */}
                        <line 
                          x1={0} 
                          y1={0} 
                          x2={0} 
                          y2={plotHeight} 
                          stroke="#bcd" 
                          strokeWidth={1.5}
                        />
                        
                        {/* X-axis line */}
                        <line 
                          x1={0} 
                          y1={plotHeight} 
                          x2={plotWidth} 
                          y2={plotHeight} 
                          stroke="#bcd" 
                          strokeWidth={1.5}
                        />
                        
                        {/* Grid lines and X-axis labels */}
                        {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                          const value = reasonableMax * ratio;
                          const xPos = value * xScale;
                          return (
                            <g key={ratio}>
                              <line 
                                x1={xPos} 
                                y1={0} 
                                x2={xPos} 
                                y2={plotHeight} 
                                stroke="#122" 
                                strokeDasharray="3 3" 
                                opacity={0.3}
                              />
                              <text 
                                x={xPos} 
                                y={plotHeight + 20} 
                                fill="#bcd" 
                                fontSize="11" 
                                textAnchor="middle"
                              >
                                {formatTimeValue(value)}
                              </text>
                            </g>
                          );
                        })}
                        
                        {/* Y-axis labels (workflow names) */}
                        {timeToFix.map((item, index) => {
                          const yPos = (index + 1) * boxSpacing;
                          return (
                            <text 
                              key={`y-label-${index}`}
                              x={-10} 
                              y={yPos + 5} 
                              fill="#bcd" 
                              fontSize="11" 
                              textAnchor="end"
                            >
                              {item.workflow.length > 15 ? item.workflow.substring(0, 12) + '...' : item.workflow}
                            </text>
                          );
                        })}
                        
                        {/* Box plots */}
                        {timeToFix.map((item, index) => {
                          const yPos = (index + 1) * boxSpacing;
                          // Cap values at reasonableMax to prevent overflow
                          const minX = Math.min((item.min || 0), reasonableMax) * xScale;
                          const q1X = Math.min((item.q1 || 0), reasonableMax) * xScale;
                          const medianX = Math.min((item.median || 0), reasonableMax) * xScale;
                          const q3X = Math.min((item.q3 || 0), reasonableMax) * xScale;
                          const maxX = Math.min((item.max || 0), reasonableMax) * xScale;
                          const meanX = Math.min((item.mean || 0), reasonableMax) * xScale;
                          const boxWidth = Math.max(q3X - q1X, 2); // Ensure minimum width
                          
                          // Check if max exceeds reasonableMax (outlier)
                          const hasOutlier = (item.max || 0) > reasonableMax;
                          
                          return (
                            <g key={item.workflow}>
                              {/* Min to Q1 whisker */}
                              <line x1={minX} y1={yPos} x2={q1X} y2={yPos} stroke="#fff" strokeWidth={1.5} />
                              <line x1={minX} y1={yPos - 8} x2={minX} y2={yPos + 8} stroke="#fff" strokeWidth={1.5} />
                              
                              {/* Q1 to Q3 box */}
                              <rect 
                                x={q1X} 
                                y={yPos - boxHeight / 2} 
                                width={boxWidth} 
                                height={boxHeight} 
                                fill="#2196f3" 
                                stroke="#fff" 
                                strokeWidth={1.5}
                                opacity={0.7}
                                style={{ cursor: 'pointer' }}
                              />
                              
                              {/* Median line */}
                              <line 
                                x1={medianX} 
                                y1={yPos - boxHeight / 2} 
                                x2={medianX} 
                                y2={yPos + boxHeight / 2} 
                                stroke="#ff9800" 
                                strokeWidth={2.5} 
                              />
                              
                              {/* Q3 to Max whisker */}
                              <line x1={q3X} y1={yPos} x2={maxX} y2={yPos} stroke="#fff" strokeWidth={1.5} />
                              <line x1={maxX} y1={yPos - 8} x2={maxX} y2={yPos + 8} stroke="#fff" strokeWidth={1.5} />
                              {hasOutlier && (
                                <>
                                  {/* Outlier indicator */}
                                  <line x1={plotWidth - 5} y1={yPos} x2={plotWidth} y2={yPos} stroke="#ff9800" strokeWidth={2} />
                                  <text 
                                    x={plotWidth + 5} 
                                    y={yPos + 4} 
                                    fill="#ff9800" 
                                    fontSize="9" 
                                    textAnchor="start"
                                  >
                                    {formatTimeValue(item.max)}
                                  </text>
                                </>
                              )}
                              
                              {/* Mean marker */}
                              <circle 
                                cx={meanX} 
                                cy={yPos} 
                                r={4} 
                                fill="#4caf50" 
                                stroke="#fff" 
                                strokeWidth={1.5}
                                style={{ cursor: 'pointer' }}
                              />
                              
                              {/* Invisible hover area for tooltip */}
                              <rect 
                                x={minX - 10} 
                                y={yPos - boxHeight / 2 - 5} 
                                width={maxX - minX + 20} 
                                height={boxHeight + 10} 
                                fill="transparent"
                                style={{ cursor: 'pointer' }}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setTooltipData(item);
                                  setTooltipPosition({ x: e.clientX, y: e.clientY });
                                }}
                                onMouseMove={(e) => {
                                  setTooltipPosition({ x: e.clientX, y: e.clientY });
                                }}
                                onMouseLeave={() => {
                                  setTooltipData(null);
                                }}
                              />
                            </g>
                          );
                        })}
                        
                        {/* X-axis label */}
                        <text 
                          x={plotWidth / 2} 
                          y={plotHeight + 45} 
                          fill="#bcd" 
                          fontSize="12" 
                          textAnchor="middle"
                          fontWeight="bold"
                        >
                          Time to Fix (seconds)
                        </text>
                        
                        {/* Y-axis label */}
                        <text 
                          x={-60} 
                          y={plotHeight / 2} 
                          fill="#bcd" 
                          fontSize="12" 
                          textAnchor="middle"
                          transform={`rotate(-90, -60, ${plotHeight / 2})`}
                          fontWeight="bold"
                        >
                          Workflow
                        </text>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                No time-to-fix data available. Time-to-fix is calculated from failure→success sequences.
              </div>
            )}
          </div>

          {/* Duration Explosion Chart */}
          <div className="card card-span-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Workflow Duration Over Time (with Explosion Detection)</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <select 
                  onChange={(e) => setSelectedWorkflowForDuration(e.target.value)}
                  style={{ padding: '8px', background: '#222', color: '#fff', border: '1px solid #444' }}
                >
                  <option value="all">All Workflows</option>
                  {workflowStats.map(w => (
                    <option key={w.name} value={w.name}>{w.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setDurationExplosionBrushKey(prev => prev + 1);
                  }}
                  style={{
                    padding: '5px 10px',
                    background: '#4caf50',
                    color: '#fff',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  Reset Zoom
                </button>
              </div>
            </div>
            {workflowStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart 
                  data={getDurationExplosionData(selectedWorkflowForDuration)} 
                  margin={{ top: 10, right: 30, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                  <XAxis dataKey="date" stroke="#bcd" angle={-45} textAnchor="end" height={80} />
                  <YAxis stroke="#bcd" label={{ value: 'Duration (s)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div style={{ background: '#222', padding: '10px', border: '1px solid #444', borderRadius: '4px' }}>
                            <p style={{ color: '#fff', margin: 0 }}>Date: {data.date}</p>
                            <p style={{ color: '#fff', margin: 0 }}>Duration: {data.duration.toFixed(1)}s</p>
                            {data.explosions && data.explosions.length > 0 && (
                              <p style={{ color: '#ff9800', margin: '5px 0 0 0', cursor: 'pointer' }} 
                                 onClick={() => window.open(data.explosions[0].html_url, '_blank')}>
                                ⚠️ Duration explosion detected - Click to view run
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="duration" 
                    stroke="#2196f3" 
                    strokeWidth={2} 
                    name="Duration" 
                    dot={{ r: 4, fill: '#2196f3' }}
                    activeDot={{
                      r: 6,
                      fill: '#2196f3',
                      stroke: '#fff',
                      strokeWidth: 2,
                      cursor: 'pointer',
                      onClick: (_, payload) => {
                        const point = payload?.payload;
                        if (point?.explosions?.length > 0 && point.explosions[0].html_url) {
                          window.open(point.explosions[0].html_url, '_blank');
                        }
                      }
                    }}
                  />
                  <Line type="monotone" dataKey="median" stroke="#4caf50" strokeWidth={2} strokeDasharray="5 5" name="Median" />
                  <Line type="monotone" dataKey="threshold" stroke="#ff9800" strokeWidth={2} strokeDasharray="3 3" name="2x Median Threshold" />
                  <Brush 
                    dataKey="date" 
                    height={30}
                    stroke="#8884d8"
                    startIndex={durationExplosionZoom?.startIndex}
                    endIndex={durationExplosionZoom?.endIndex}
                    onChange={(e) => {
                      if (e && typeof e.startIndex === 'number' && typeof e.endIndex === 'number') {
                        setDurationExplosionZoom({ startIndex: e.startIndex, endIndex: e.endIndex });
                      } else {
                        setDurationExplosionZoom(null);
                      }
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                No workflow data available
              </div>
            )}
          </div>

          {/* Failure Worsening Chart */}
          <div className="card card-span-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>Failure Rate Over Time (Worsening Detection)</h3>
              <button
                onClick={() => {
                  setFailureWorseningZoom(null);
                }}
                style={{
                  padding: '5px 10px',
                  background: failureWorseningZoom ? '#4caf50' : '#333',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  cursor: failureWorseningZoom ? 'pointer' : 'default',
                  fontSize: '11px'
                }}
                disabled={!failureWorseningZoom}
              >
                Reset Zoom
              </button>
        </div>
            {workflowStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart 
                  data={getFailureWorseningData()} 
                  margin={{ top: 10, right: 30, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#bcd" 
                    angle={-45} 
                    textAnchor="end" 
                    height={80}
                  />
                  <YAxis stroke="#bcd" label={{ value: 'Failure Rate (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div style={{ background: '#222', padding: '10px', border: '1px solid #444', borderRadius: '4px' }}>
                            <p style={{ color: '#fff', margin: 0 }}>Date: {data.date}</p>
                            <p style={{ color: '#fff', margin: 0 }}>Failure Rate: {data.failureRate.toFixed(1)}%</p>
                            <p style={{ color: '#fff', margin: 0 }}>Failures: {data.failures} / {data.total}</p>
                            {data.worsening > 0 && data.firstFailureUrl && (
                              <p style={{ color: '#ff5722', margin: '5px 0 0 0', cursor: 'pointer' }} 
                                 onClick={() => window.open(data.firstFailureUrl, '_blank')}>
                                ⚠️ Worsening detected - Click to view first failure
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="failureRate" fill="#f44336" fillOpacity={0.3} stroke="#f44336" name="Failure Rate" />
                  <Line type="monotone" dataKey="threshold" stroke="#ff9800" strokeWidth={2} strokeDasharray="5 5" name="50% Threshold" />
                  <Bar 
                    dataKey="worsening" 
                    fill="#ff5722" 
                    name="Worsening Period"
                    cursor="pointer"
                    onClick={(data) => {
                      if (data?.payload?.worsening > 0 && data?.payload?.firstFailureUrl) {
                        window.open(data.payload.firstFailureUrl, '_blank');
                      }
                    }}
                  />
                  <Brush 
                    dataKey="date" 
                    height={30}
                    stroke="#8884d8"
                    startIndex={failureWorseningZoom?.startIndex}
                    endIndex={failureWorseningZoom?.endIndex}
                    onChange={(e) => {
                      if (e && typeof e.startIndex === 'number' && typeof e.endIndex === 'number') {
                        setFailureWorseningZoom({ startIndex: e.startIndex, endIndex: e.endIndex });
                      } else {
                        setFailureWorseningZoom(null);
                      }
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                No workflow data available
              </div>
            )}
          </div>

        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
