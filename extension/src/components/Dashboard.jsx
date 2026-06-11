import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchDashboardDataViaWebSocket, clearWebSocketCache, filterRunsLocally, convertRunsToDashboard } from '../websocket';

// We need to access the internal convertRunsToDashboard function
// Since it's not exported, we'll use filterRunsLocally which uses it internally
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

function UIIcon({ name }) {
  const icons = {
    moon: <><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" /><path d="M3 3l6 6M21 3l-6 6M21 21l-6-6M3 21l6-6" /></>,
    zoom: <><circle cx="11" cy="11" r="7" /><path d="M11 8v6M8 11h6M16.5 16.5 21 21" /></>,
    reset: <><path d="M4 7v5h5" /><path d="M20 17a8 8 0 0 1-13.4 3.9L4 18" /><path d="M20 7a8 8 0 0 0-13.4-3.9L4 6" /></>,
    play: <path d="M8 5v14l11-7-11-7Z" />,
    check: <path d="M20 6 9 17l-5-5" />,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v6l4 2" /></>,
    pulse: <path d="M3 13h4l3-7 4 13 3-7h4" />,
    workflow: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M8 7.5 11 16M16 7.5 13 16" /></>,
    jobs: <><path d="M5 12c2.5-4 5.5-4 8 0s5.5 4 8 0" /><path d="M5 16c2.5-4 5.5-4 8 0s5.5 4 8 0" /></>,
    branch: <><circle cx="7" cy="5" r="2" /><circle cx="17" cy="12" r="2" /><circle cx="7" cy="19" r="2" /><path d="M7 7v10M9 6c4 0 8 2 8 6M9 18c4 0 8-2 8-6" /></>,
    events: <><path d="M4 13h3l2-5 4 10 2-5h5" /><path d="M4 7h4M16 7h4" /></>,
    contributors: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3.5 19c.8-3.6 3-5 5.5-5s4.7 1.4 5.5 5" /><path d="M13.5 15c1-.9 2.1-1.3 3.5-1.3 2.1 0 3.8 1.2 4.5 4.3" /></>
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {icons[name] || icons.play}
    </svg>
  );
}

function ThemeToggle({ theme, onToggle }) {
  const isLight = theme === 'light';
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-pressed={isLight}
      onClick={onToggle}
    >
      <span className="theme-knob" aria-hidden="true">
        <span className="theme-icon sun-icon"><UIIcon name="sun" /></span>
        <span className="theme-icon moon-icon"><UIIcon name="moon" /></span>
      </span>
    </button>
  );
}

function PanelIconButton({ icon, label, onClick, disabled = false }) {
  return (
    <button
      className="panel-icon-button"
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <UIIcon name={icon} />
    </button>
  );
}

function PanelControls({ panelId, zoomed, onZoom, onReset }) {
  return (
    <div className="panel-controls" aria-label="Panel controls">
      <PanelIconButton icon="zoom" label="Zoom into graph data" onClick={() => onZoom(panelId)} />
      <PanelIconButton icon="reset" label="Reset zoom" onClick={onReset} disabled={!zoomed} />
    </div>
  );
}

function MetricCard({ tone = 'info', icon, title, explanation, value, note, children }) {
  return (
    <div className={`stat-card metric-card metric-${tone} card`}>
      <div className="metric-accent" aria-hidden="true" />
      <div className="metric-title">
        <span className={`metric-icon metric-icon-${tone}`} aria-hidden="true"><UIIcon name={icon} /></span>
        <span>{title}</span>
        <InfoIcon explanation={explanation} />
      </div>
      <div className="metric-body">
        <div>
          <div className="value">{value}</div>
          {note && <div className={`metric-note ${tone}`}>{note}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

// InfoIcon component for displaying help tooltips
function InfoIcon({ explanation, id }) {
  const [isOpen, setIsOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState(null);
  const [popupPlacement, setPopupPlacement] = useState('above');
  const iconRef = useRef(null);
  const popupRef = useRef(null);

  const updatePopupPosition = () => {
    if (!iconRef.current) return;

    const rect = iconRef.current.getBoundingClientRect();
    const popupRect = popupRef.current?.getBoundingClientRect();
    const viewportPadding = 12;
    const popupWidth = Math.min(popupRect?.width || 320, window.innerWidth - viewportPadding * 2);
    const popupHeight = Math.min(popupRect?.height || 220, window.innerHeight - viewportPadding * 2);
    const gap = 10;
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - viewportPadding - popupWidth
    );
    const spaceAbove = rect.top - viewportPadding;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const placeAbove = spaceAbove >= popupHeight + gap || spaceAbove >= spaceBelow;
    const top = placeAbove
      ? Math.max(viewportPadding, Math.min(rect.top - gap - popupHeight, window.innerHeight - viewportPadding - popupHeight))
      : Math.max(viewportPadding, Math.min(rect.bottom + gap, window.innerHeight - viewportPadding - popupHeight));

    setPopupPlacement(placeAbove ? 'above' : 'below');

    setPopupStyle({
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      transform: 'none',
      width: `${popupWidth}px`,
    });
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updatePopupPosition();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (iconRef.current && popupRef.current && 
          !iconRef.current.contains(event.target) && 
          !popupRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      updatePopupPosition();
      document.addEventListener('mousedown', handleClickOutside);

      const handleReposition = () => updatePopupPosition();
      window.addEventListener('resize', handleReposition);
      window.addEventListener('scroll', handleReposition, true);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('resize', handleReposition);
        window.removeEventListener('scroll', handleReposition, true);
      };
    }
  }, [isOpen]);

  return (
    <div style={{ position: 'relative', display: 'inline-block', marginLeft: '8px' }}>
      <button
        ref={iconRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          border: '1px solid #666',
          background: '#333',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          padding: 0,
          lineHeight: 1,
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.target.style.background = '#444';
          e.target.style.borderColor = '#888';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = '#333';
          e.target.style.borderColor = '#666';
        }}
        aria-label="Show explanation"
      >
        ?
      </button>
      {isOpen && (
        createPortal(
          <div
            ref={popupRef}
            className="info-icon-popup"
            data-placement={popupPlacement}
            style={popupStyle || undefined}
          >
            <div style={{ marginBottom: '8px', fontWeight: 'bold', color: '#fff', fontSize: '14px' }}>
              {explanation.title || 'Information'}
            </div>
            <div>{explanation.text}</div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: 1,
                padding: 0,
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.target.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.target.style.color = '#888';
              }}
            >
              ×
            </button>
          </div>,
          document.body
        )
      )}
    </div>
  );
}

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

function getDateRangeLabel(startStr, endStr) {
  if (!startStr || !endStr) return null;
  
  const start = parseDateStr(startStr);
  const end = parseDateStr(endStr);
  if (!start || !end) return null;
  
  const now = new Date();
  
  // Check for Current Month
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  if (start.getTime() === firstDayOfMonth.getTime() && 
      end.getTime() === lastDayOfMonth.getTime()) {
    return 'Current month';
  }
  
  // Check for Current Year
  const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
  const lastDayOfYear = new Date(now.getFullYear(), 11, 31);
  if (start.getTime() === firstDayOfYear.getTime() && 
      end.getTime() === lastDayOfYear.getTime()) {
    return 'Current year';
  }
  
  // Check for All Time (very wide range, typically 2000-2100)
  // Check if the range spans at least 50 years (to catch "All Time" selections)
  const yearsDiff = end.getFullYear() - start.getFullYear();
  if (yearsDiff >= 50 && start.getFullYear() <= 2010 && end.getFullYear() >= 2090) {
    return 'All time';
  }
  
  return null; // Return null if it's a custom range
}

export default function Dashboard() {
  // ============================================
  // State Management
  // ============================================

  const getCurrentDefaults = () => {
    const now = new Date();
    // Set default to current month (first day to last day)
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const defaultStart = formatDateForInput(firstDayOfMonth);
    const defaultEnd = formatDateForInput(lastDayOfMonth);
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
  const lastKnownTotalRunsRef = useRef(0);
  
  // Real-time elapsed time counter
  const [localElapsed, setLocalElapsed] = useState(0);
  const [phase1StartTime, setPhase1StartTime] = useState(null);
  const [phase2StartTime, setPhase2StartTime] = useState(null);
  const elapsedIntervalRef = useRef(null);
  const [jobProgress, setJobProgress] = useState({ runs_processed: 0, total_runs: 0, jobs_collected: 0, isCollecting: false });
  const [dashboardTheme, setDashboardTheme] = useState('dark');
  const [collectionPaused, setCollectionPaused] = useState(false);
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
  const [dataExists, setDataExists] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [existingRunsCount, setExistingRunsCount] = useState(0);
  const [checkingData, setCheckingData] = useState(true);
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
  const [dailyRunsZoom, setDailyRunsZoom] = useState(null);
  const [durationVariabilityZoom, setDurationVariabilityZoom] = useState(null);
  const [cumulativeFailureZoom, setCumulativeFailureZoom] = useState(null);
  const [timeToFixZoom, setTimeToFixZoom] = useState(null);
  const [durationExplosionZoom, setDurationExplosionZoom] = useState(null);
  const [failureWorseningZoom, setFailureWorseningZoom] = useState(null);
  const [durationExplosionBrushKey, setDurationExplosionBrushKey] = useState(0);

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

  // Check for existing data when repo changes and auto-load it
  useEffect(() => {
    if (currentRepo && !collectionStarted && !data) {
      setCheckingData(true);
      checkExistingData(currentRepo).then((result) => {
        setCheckingData(false);
        if (result && result.exists) {
          // Auto-load existing data immediately
          console.log('[Dashboard] Found existing data, auto-loading...');
          loadExistingData(currentRepo).then((loaded) => {
            if (loaded) {
              console.log('[Dashboard] Existing data loaded successfully');
              // Update data existence status
              setDataExists(true);
              setExistingRunsCount(result.totalRuns || 0);
              setLastUpdated(result.lastUpdated);
            } else {
              console.error('[Dashboard] Failed to load existing data');
            }
          }).catch((err) => {
            console.error('[Dashboard] Error in loadExistingData:', err);
          });
        } else {
          setDataExists(false);
        }
      }).catch((err) => {
        console.error('[Dashboard] Error in checkExistingData:', err);
        setCheckingData(false);
      });
    }
  }, [currentRepo, collectionStarted, data]);

  // ============================================
  // Data Loading Functions
  // ============================================

  // Check if data exists for the current repo
  const checkExistingData = async (repo) => {
    if (!repo) return;
    
    try {
      const encodedRepo = encodeURIComponent(repo);
      const response = await fetch(`http://127.0.0.1:3000/api/data/check/${encodedRepo}`);
      if (response.ok) {
        const result = await response.json();
        setDataExists(result.exists);
        setLastUpdated(result.lastUpdated);
        setExistingRunsCount(result.totalRuns || 0);
        return result;
      }
    } catch (err) {
      console.error('[Dashboard] Error checking existing data:', err);
    }
    return { exists: false };
  };

  // Load existing data from cache
  const loadExistingData = async (repo) => {
    if (!repo) return false;
    
    try {
      const encodedRepo = encodeURIComponent(repo);
      const response = await fetch(`http://127.0.0.1:3000/api/data/load/${encodedRepo}`);
      if (response.ok) {
        const result = await response.json();
        if (result.runs && result.runs.length > 0) {
          console.log(`[Dashboard] Loaded ${result.runs.length} runs from API`);
          
          // Store runs in Chrome storage - this triggers the storage listener in websocket.js
          if (typeof chrome !== 'undefined' && chrome.storage) {
            await new Promise((resolve) => {
              chrome.storage.local.set({ 
                wsRuns: result.runs,
                wsStatus: {
                  isStreaming: false,
                  isComplete: true,
                  repo: repo,
                  totalRuns: result.runs.length
                }
              }, () => {
                // Wait a bit for the storage listener to update _runsByRepo
                setTimeout(resolve, 200);
              });
            });
          }
          
          // Now process the runs into dashboard format
          // Use convertRunsToDashboard directly (no dependency on _runsByRepo)
          const processedData = processRunsToDashboardFormat(result.runs, repo);
          
          if (processedData) {
            console.log('[Dashboard] Processed data successfully:', processedData.totalRuns, 'runs');
            setData(processedData);
            setDataLoaded(true);
            setCollectionStarted(true);
            setLoading(false);
            return true;
          } else {
            console.error('[Dashboard] processRunsToDashboardFormat returned null, runs count:', result.runs.length);
            // This shouldn't happen now that we use convertRunsToDashboard directly
            // But if it does, return false so the UI shows the button
            return false;
          }
        }
      }
    } catch (err) {
      console.error('[Dashboard] Error loading existing data:', err);
    }
    return false;
  };

  // Process runs into dashboard format using convertRunsToDashboard directly
  const processRunsToDashboardFormat = (runs, repo = null) => {
    if (!runs || runs.length === 0) {
      console.log('[Dashboard] processRunsToDashboardFormat: No runs provided');
      return null;
    }
    
    const repoToUse = repo || currentRepo;
    if (!repoToUse) {
      console.error('[Dashboard] processRunsToDashboardFormat: No repo available');
      return null;
    }
    
    console.log(`[Dashboard] Processing ${runs.length} runs for repo: ${repoToUse}`);
    
    // Store runs in Chrome storage - this will trigger the storage listener in websocket.js
    // which will populate _runsByRepo for future use
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ 
        wsRuns: runs,
        wsStatus: {
          isStreaming: false,
          isComplete: true,
          repo: repoToUse,
          totalRuns: runs.length
        }
      });
    }
    
    // Use convertRunsToDashboard directly instead of filterRunsLocally
    // This avoids the dependency on _runsByRepo being populated
    const startDate = dateFiltersRef.current.start || filters.start;
    const endDate = dateFiltersRef.current.end || filters.end;
    
    try {
      const dashboardData = convertRunsToDashboard(runs, repoToUse, {
        workflow: ['all'],
        branch: ['all'],
        actor: ['all'],
        startDate: startDate,
        endDate: endDate
      });
      
      if (dashboardData) {
        console.log(`[Dashboard] Successfully converted to dashboard format: ${dashboardData.totalRuns} runs`);
      } else {
        console.error('[Dashboard] convertRunsToDashboard returned null');
      }
      
      return dashboardData;
    } catch (err) {
      console.error('[Dashboard] Error in convertRunsToDashboard:', err);
      return null;
    }
  };

  // Load data (only when dates change)
  const loadDashboardData = async (collectMore = false, options = {}) => {
    const preserveStreamingCache = !!options.preserveStreamingCache;
    setCollectionStarted(true);
    setLoading(true);
    setError(null);
    setCollectionPaused(false);
    setProgress(prev => preserveStreamingCache
      ? {
          ...prev,
          complete: false,
          isStreaming: true,
          phase: 'workflow_runs',
          totalRuns: prev.totalRuns || lastKnownTotalRunsRef.current || 0
        }
      : {
          items: 0,
          complete: false,
          isStreaming: true,
          phase: 'workflow_runs',
          totalRuns: 0,
          elapsed_time: null,
          eta_seconds: null,
          phase1_elapsed: null,
          phase2_elapsed: null,
          phase2_eta: null
        });
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

      if (!preserveStreamingCache) {
        clearWebSocketCache(repo);
      }
      
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
        
        // Update collection stats if available
        if (partialData.newRuns !== undefined) {
          setProgress(prev => ({
            ...prev,
            newRuns: partialData.newRuns,
            existingRuns: partialData.existingRuns
          }));
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
        
        // Always set data, even during collection (not just at the end)
        // This ensures data is shown as it's collected
        if (filteredData) {
          setData(filteredData);
          setLoading(false);
        }
        
        setProgress(prev => ({ 
          ...prev,
          items: partialData.totalRuns || 0, 
          complete: isComplete,
          isStreaming: !isComplete
        }));
        
        if (isComplete) {
          setDataLoaded(true);
          // Update data existence status after collection
          checkExistingData(repo);
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

  const cancelCollection = () => {
    console.info('[Dashboard] Cancel collection is currently disabled.');
  };

  const resumeCollection = () => {
    console.info('[Dashboard] Resume collection is currently disabled.');
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
          isPaused: status.isPaused,
          totalRuns: status.totalRuns,
          collectedRuns: status.collectedRuns,
          runsWithJobs: status.runsWithJobs,
          totalJobs: status.totalJobs,
          phase: status.phase,
          phase1_elapsed: status.phase1_elapsed,  // Debug: Phase 1 elapsed time
          phase2_elapsed: status.phase2_elapsed   // Debug: Phase 2 elapsed time
        });

        setCollectionPaused(!!status.isPaused);
        if (status.totalRuns) {
          lastKnownTotalRunsRef.current = status.totalRuns;
        }
        
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
            totalRuns: status.totalRuns || prev.totalRuns || lastKnownTotalRunsRef.current || 0, // Total count from API
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
        if (status.totalRuns) {
          lastKnownTotalRunsRef.current = status.totalRuns;
        }
        setProgress({
          items: (status.collectedRuns !== undefined && status.collectedRuns !== null) 
            ? status.collectedRuns 
            : 0, // Current collected count
          complete: status.isComplete || false,
          isStreaming: status.isStreaming || false,
          phase: status.phase || 'workflow_runs',
          totalRuns: status.totalRuns || lastKnownTotalRunsRef.current || 0, // Total count from API
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
      <div className={`dashboard ${dashboardTheme} container`}>
        <section className="collection-start card">
          <div>
            <p className="eyebrow">{currentRepo || 'GitHub repository'}</p>
            <h2>GitHub Actions Dashboard</h2>
            <p>
              Ready to collect workflow run data for <strong>{currentRepo || 'this repository'}</strong>
            </p>
            <p className="collection-start-note">
              Collect all available workflow runs first, then use workflow, branch, actor, and date filters on the dashboard.
            </p>
          </div>
          <div className="collection-start-actions">
            <ThemeToggle
              theme={dashboardTheme}
              onToggle={() => setDashboardTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            />
            <button className="primary-action primary-action-large" onClick={loadDashboardData} type="button">
              Start Data Collection
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (loading && !data && collectionStarted) {
    return (
      <div className={`dashboard ${dashboardTheme} container`}>
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
    <div className={`dashboard ${dashboardTheme} container`}>
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
          <button className="primary-action" onClick={loadDashboardData} type="button">Retry</button>
        </div>
      </div>
    </div>
  );
  // If no data and collection hasn't started, show button (already handled above)
  // If no data but collection has started, show loading or error (already handled above)
  // If we have data, continue to render dashboard
  if (!data) {
    // Show loading state while checking for existing data
    if (checkingData) {
      return (
        <div className={`dashboard ${dashboardTheme} container`}>
          <div style={{ textAlign: 'center', padding: '60px 40px' }}>
            <h2>GitHub Actions Dashboard</h2>
            <p>Checking for existing data...</p>
          </div>
        </div>
      );
    }
    
    // This should not be reached if button logic is correct, but as fallback:
    if (!collectionStarted) {
      return (
        <div className={`dashboard ${dashboardTheme} container`}>
          <div className="collection-start card">
            <h2>GitHub Actions Dashboard</h2>
            <p>
              Ready to collect workflow run data for <strong>{currentRepo || 'this repository'}</strong>
            </p>
            <button 
              className="primary-action primary-action-large" 
              onClick={() => loadDashboardData(false)}
              type="button"
            >
              Start Data Collection
            </button>
          </div>
        </div>
      );
    }
    return null;
  }
  
  if (data.noData) return <div className={`dashboard ${dashboardTheme} container`} style={{ textAlign: 'center', padding: '2rem' }}>
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

  // Helper function to calculate median
  const calculateMedian = (values) => {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].filter(v => v > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  };

  // Helper function for duration explosion chart
  const getDurationExplosionData = (workflowName) => {
    if (!rawRuns || rawRuns.length === 0) return [];
    
    let filteredRuns = rawRuns;
    if (workflowName !== 'all') {
      filteredRuns = rawRuns.filter(r => r.workflow_name === workflowName);
    }
    
    // Sort runs by created_at to ensure chronological order
    const sortedRuns = [...filteredRuns].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    });
    
    const windowSize = 10;
    const thresholdMultiplier = 1.5; // Stricter threshold - only significant worsening
    
    // Group by date for display
    const byDate = {};
    const worseningPoints = [];
    
    // Check each point for worsening
    for (let i = windowSize; i < sortedRuns.length - windowSize; i++) {
      const currentRun = sortedRuns[i];
      const currentDate = currentRun.created_at ? currentRun.created_at.split('T')[0] : 'Unknown';
      
      // Get previous 10 runs (before current point)
      const previousRuns = sortedRuns.slice(i - windowSize, i);
      const previousDurations = previousRuns.map(r => r.duration || 0);
      const previousMedian = calculateMedian(previousDurations);
      
      // Get next 10 runs (after current point)
      const nextRuns = sortedRuns.slice(i + 1, i + 1 + windowSize);
      const nextDurations = nextRuns.map(r => r.duration || 0);
      const nextMedian = calculateMedian(nextDurations);
      
      // Check if there's significant worsening
      if (previousMedian > 0 && nextMedian > 0 && nextMedian > previousMedian * thresholdMultiplier) {
        // Calculate severity score (how much worse it got)
        const severityScore = (nextMedian - previousMedian) / previousMedian;
        const dateTimestamp = new Date(currentDate).getTime();
        
        // Store the worsening point with commit info
        const commitSha = currentRun.commit_sha || currentRun.head_sha || null;
        // Extract repo from html_url if currentRepo is not available
        let repo = currentRepo;
        if (!repo && currentRun.html_url) {
          const urlMatch = currentRun.html_url.match(/github\.com\/([^\/]+\/[^\/]+)/);
          if (urlMatch) {
            repo = urlMatch[1];
          }
        }
        const commitUrl = commitSha && repo
          ? `https://github.com/${repo}/commit/${commitSha}`
          : (commitSha ? `https://github.com/${repo || 'unknown'}/commit/${commitSha}` : currentRun.html_url);
        
        const worseningPoint = {
          date: currentDate,
          dateTimestamp,
          duration: currentRun.duration || 0,
          previousMedian,
          nextMedian,
          severityScore,
          commitSha,
          commitUrl,
          html_url: currentRun.html_url,
          created_at: currentRun.created_at,
          run: currentRun
        };
        
        worseningPoints.push(worseningPoint);
      }
      
      // Always add all runs to byDate for the line chart
      if (!byDate[currentDate]) {
        byDate[currentDate] = { 
          durations: [], 
          runs: [],
          worseningPoint: null
        };
      }
      byDate[currentDate].durations.push(currentRun.duration || 0);
      byDate[currentDate].runs.push(currentRun);
    }
    
    // Select top 3 worsening points that are spaced apart
    const selectedWorseningPoints = [];
    if (worseningPoints.length > 0) {
      // Sort by severity (highest first)
      const sortedBySeverity = [...worseningPoints].sort((a, b) => b.severityScore - a.severityScore);
      
      // Minimum time distance between points (30 days in milliseconds)
      const minTimeDistance = 30 * 24 * 60 * 60 * 1000;
      
      // Greedily select top points that are far apart
      for (const point of sortedBySeverity) {
        if (selectedWorseningPoints.length >= 3) break;
        
        // Check if this point is far enough from already selected points
        const isFarEnough = selectedWorseningPoints.every(selected => 
          Math.abs(point.dateTimestamp - selected.dateTimestamp) >= minTimeDistance
        );
        
        if (isFarEnough) {
          selectedWorseningPoints.push(point);
          // Mark this date in byDate
          if (byDate[point.date]) {
            byDate[point.date].worseningPoint = point;
          }
        }
      }
      
      // If we don't have 3 points yet, add the most severe remaining ones
      for (const point of sortedBySeverity) {
        if (selectedWorseningPoints.length >= 3) break;
        if (!selectedWorseningPoints.includes(point)) {
          selectedWorseningPoints.push(point);
          if (byDate[point.date]) {
            byDate[point.date].worseningPoint = point;
          }
        }
      }
    }
    
    // Calculate overall median for reference line
    const allDurations = sortedRuns.map(r => r.duration || 0).filter(d => d > 0);
    const overallMedian = calculateMedian(allDurations);
    
    return Object.entries(byDate)
      .map(([date, data]) => ({
        date,
        duration: data.durations.length > 0 
          ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length 
          : 0,
        median: overallMedian,
        worseningPoint: data.worseningPoint,
        hasWorsening: data.worseningPoint !== null
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
    
    // Convert to sorted array of dates
    const sortedDates = Object.keys(byDate).sort((a, b) => new Date(a) - new Date(b));
    const windowSize = 10; // 10 days
    const thresholdMultiplier = 1.5; // Stricter threshold - only significant worsening
    const worseningPoints = [];
    
    // Check each date for worsening
    for (let i = windowSize; i < sortedDates.length - windowSize; i++) {
      const currentDate = sortedDates[i];
      const currentData = byDate[currentDate];
      
      // Get previous 10 days
      const previousDates = sortedDates.slice(i - windowSize, i);
      const previousFailures = previousDates.reduce((sum, date) => {
        const dateData = byDate[date];
        return sum + dateData.runs.filter(r => r.conclusion === 'failure').length;
      }, 0);
      
      // Get next 10 days
      const nextDates = sortedDates.slice(i + 1, i + 1 + windowSize);
      const nextFailures = nextDates.reduce((sum, date) => {
        const dateData = byDate[date];
        return sum + dateData.runs.filter(r => r.conclusion === 'failure').length;
      }, 0);
      
      // Check if there's significant worsening
      if (previousFailures >= 0 && nextFailures > previousFailures * thresholdMultiplier && nextFailures > 0) {
        // Calculate severity score (how much worse it got)
        const severityScore = previousFailures > 0 
          ? (nextFailures - previousFailures) / previousFailures 
          : nextFailures; // If no previous failures, severity is just the absolute number
        const dateTimestamp = new Date(currentDate).getTime();
        
        // Find the first failure run on this date to get commit info
        const firstFailure = currentData.runs.find(r => r.conclusion === 'failure');
        if (firstFailure) {
          const commitSha = firstFailure.commit_sha || firstFailure.head_sha || null;
          // Extract repo from html_url if currentRepo is not available
          let repo = currentRepo;
          if (!repo && firstFailure.html_url) {
            const urlMatch = firstFailure.html_url.match(/github\.com\/([^\/]+\/[^\/]+)/);
            if (urlMatch) {
              repo = urlMatch[1];
            }
          }
          const commitUrl = commitSha && repo
            ? `https://github.com/${repo}/commit/${commitSha}`
            : (commitSha ? `https://github.com/${repo || 'unknown'}/commit/${commitSha}` : firstFailure.html_url);
          
          const worseningPoint = {
            date: currentDate,
            dateTimestamp,
            previousFailures,
            nextFailures,
            severityScore,
            commitSha,
            commitUrl,
            html_url: firstFailure.html_url,
            run: firstFailure
          };
          
          worseningPoints.push(worseningPoint);
        }
      }
    }
    
    // Select top 3 worsening points that are spaced apart
    const selectedWorseningPoints = [];
    if (worseningPoints.length > 0) {
      // Sort by severity (highest first)
      const sortedBySeverity = [...worseningPoints].sort((a, b) => b.severityScore - a.severityScore);
      
      // Minimum time distance between points (30 days in milliseconds)
      const minTimeDistance = 30 * 24 * 60 * 60 * 1000;
      
      // Greedily select top points that are far apart
      for (const point of sortedBySeverity) {
        if (selectedWorseningPoints.length >= 3) break;
        
        // Check if this point is far enough from already selected points
        const isFarEnough = selectedWorseningPoints.every(selected => 
          Math.abs(point.dateTimestamp - selected.dateTimestamp) >= minTimeDistance
        );
        
        if (isFarEnough) {
          selectedWorseningPoints.push(point);
          // Mark this date in byDate
          if (byDate[point.date]) {
            byDate[point.date].worseningPoint = point;
          }
        }
      }
      
      // If we don't have 3 points yet, add the most severe remaining ones
      for (const point of sortedBySeverity) {
        if (selectedWorseningPoints.length >= 3) break;
        if (!selectedWorseningPoints.includes(point)) {
          selectedWorseningPoints.push(point);
          if (byDate[point.date]) {
            byDate[point.date].worseningPoint = point;
          }
        }
      }
    }
    
    // Build result array
    return sortedDates.map(date => {
      const data = byDate[date];
      const total = data.runs.length;
      const failures = data.runs.filter(r => r.conclusion === 'failure').length;
      const failureRate = total > 0 ? failures / total : 0;
      
      return {
        date,
        failureRate: failureRate * 100,
        total,
        failures,
        worseningPoint: data.worseningPoint || null,
        hasWorsening: data.worseningPoint !== null && data.worseningPoint !== undefined
      };
    });
  };

  const getNextZoomRange = (length, currentZoom = null) => {
    if (!length || length <= 2) return null;

    const currentStart = currentZoom?.startIndex ?? 0;
    const currentEnd = currentZoom?.endIndex ?? length - 1;
    const currentSize = currentEnd - currentStart + 1;
    const nextSize = Math.max(2, Math.ceil(currentSize * 0.6));

    if (nextSize >= currentSize) {
      return { startIndex: currentStart, endIndex: currentEnd };
    }

    const center = Math.round((currentStart + currentEnd) / 2);
    const startIndex = Math.max(0, Math.min(length - nextSize, center - Math.floor(nextSize / 2)));
    return { startIndex, endIndex: startIndex + nextSize - 1 };
  };

  const getZoomedData = (items, zoom) => {
    if (!zoom || !Array.isArray(items)) return items;
    return items.slice(zoom.startIndex, zoom.endIndex + 1);
  };

  const durationExplosionData = getDurationExplosionData(selectedWorkflowForDuration);
  const failureWorseningData = getFailureWorseningData();
  const visibleRunsOverTime = getZoomedData(runsOverTime, dailyRunsZoom);
  const visibleTimeToFix = getZoomedData(timeToFix, timeToFixZoom);

  const getPanelZoom = (panelId) => {
    switch (panelId) {
      case 'dailyRuns':
        return dailyRunsZoom;
      case 'durationVariability':
        return durationVariabilityZoom;
      case 'cumulativeFailure':
        return cumulativeFailureZoom;
      case 'timeToFix':
        return timeToFixZoom;
      case 'durationExplosion':
        return durationExplosionZoom;
      case 'failureWorsening':
        return failureWorseningZoom;
      default:
        return null;
    }
  };

  const setPanelZoom = (panelId, zoom) => {
    switch (panelId) {
      case 'dailyRuns':
        setDailyRunsZoom(zoom);
        break;
      case 'durationVariability':
        setDurationVariabilityZoom(zoom);
        break;
      case 'cumulativeFailure':
        setCumulativeFailureZoom(zoom);
        break;
      case 'timeToFix':
        setTimeToFixZoom(zoom);
        break;
      case 'durationExplosion':
        setDurationExplosionZoom(zoom);
        break;
      case 'failureWorsening':
        setFailureWorseningZoom(zoom);
        break;
      default:
        break;
    }
  };

  const getPanelDataLength = (panelId) => {
    switch (panelId) {
      case 'dailyRuns':
      case 'durationVariability':
        return runsOverTime.length;
      case 'cumulativeFailure':
        return failureDurationOverTime.length;
      case 'timeToFix':
        return timeToFix.length;
      case 'durationExplosion':
        return durationExplosionData.length;
      case 'failureWorsening':
        return failureWorseningData.length;
      default:
        return 0;
    }
  };

  const zoomPanelData = (panelId) => {
    const nextZoom = getNextZoomRange(getPanelDataLength(panelId), getPanelZoom(panelId));
    setPanelZoom(panelId, nextZoom);
  };

  const resetPanelZoom = (panelId, afterReset = null) => {
    setPanelZoom(panelId, null);
    if (afterReset) afterReset();
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

  // Determine the best time unit based on data range
  const getTimeUnit = (timeToFixData) => {
    if (!timeToFixData || timeToFixData.length === 0) {
      return { unit: 'seconds', label: 's', divisor: 1, fullLabel: 'seconds' };
    }
    
    // Get representative values (medians and q3s) to decide the unit
    const representativeValues = timeToFixData.flatMap(d => [d.median, d.q3, d.mean].filter(v => v > 0));
    if (representativeValues.length === 0) {
      return { unit: 'seconds', label: 's', divisor: 1, fullLabel: 'seconds' };
    }
    
    // Use median of representative values to determine unit
    const sorted = [...representativeValues].sort((a, b) => a - b);
    const medianValue = sorted[Math.floor(sorted.length / 2)];
    
    if (medianValue >= 86400) { // >= 1 day
      return { unit: 'days', label: 'd', divisor: 86400, fullLabel: 'days' };
    } else if (medianValue >= 3600) { // >= 1 hour
      return { unit: 'hours', label: 'h', divisor: 3600, fullLabel: 'hours' };
    } else if (medianValue >= 60) { // >= 1 minute
      return { unit: 'minutes', label: 'm', divisor: 60, fullLabel: 'minutes' };
    }
    return { unit: 'seconds', label: 's', divisor: 1, fullLabel: 'seconds' };
  };
  
  // Format a value with the given time unit
  const formatWithUnit = (seconds, divisor, label) => {
    if (seconds === 0 || seconds == null) return `0${label}`;
    const value = seconds / divisor;
    if (value < 0.1) return `<0.1${label}`;
    if (value < 10) return `${value.toFixed(1)}${label}`;
    return `${Math.round(value)}${label}`;
  };
  
  // Format time value for tooltip (always show most readable format)
  const formatTimeForTooltip = (seconds) => {
    if (seconds === 0 || seconds == null) return '0s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m (${Math.round(seconds)}s)`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h (${Math.round(seconds / 60)}m)`;
    return `${(seconds / 86400).toFixed(1)}d (${Math.round(seconds / 3600)}h)`;
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
    <div className={`dashboard ${dashboardTheme}`}>
      <div className="container">
        {(progress.isStreaming || collectionPaused) && (
          <section className={`collection-banner ${collectionPaused ? 'paused' : ''}`} aria-label="Collection status">
            <div className="status-dot" aria-hidden="true" />
            <div>
              <p className="banner-title">
                {collectionPaused
                  ? 'Collection paused'
                  : progress.phase === 'workflow_runs'
                    ? 'Collecting workflow runs'
                    : 'Collecting job details'}
              </p>
              <p className="banner-meta">
                {progress.phase === 'workflow_runs' || collectionPaused
                  ? `${progress.items || 0} / ${progress.totalRuns || '?'} runs`
                  : `${jobProgress.runs_processed || 0} / ${jobProgress.total_runs || 0} runs (${jobProgress.jobs_collected || 0} jobs)`}
              </p>
            </div>
            <div className="banner-progress" aria-hidden="true">
              <span style={{
                width: progress.totalRuns
                  ? `${Math.min(100, Math.round(((progress.items || jobProgress.runs_processed || 0) / progress.totalRuns) * 100))}%`
                  : '12%'
              }} />
            </div>
            <dl className="banner-times">
              <div>
                <dt>Elapsed</dt>
                <dd>{formatDuration(localElapsed || progress.elapsed_time || progress.phase2_elapsed || 0)}</dd>
              </div>
              {(progress.eta_seconds || progress.phase2_eta) && (
                <div>
                  <dt>ETA</dt>
                  <dd>{formatDuration(progress.eta_seconds || progress.phase2_eta)}</dd>
                </div>
              )}
            </dl>
            {collectionPaused ? (
              <button className="resume-action" type="button" onClick={resumeCollection}>Resume collection</button>
            ) : (
              <button className="cancel-action" type="button" onClick={cancelCollection}>Cancel collection</button>
            )}
          </section>
        )}

        <section className="overall-health-section card" aria-label="Overall health check">
          <div className="overall-health-header">
            <div>
              <p className="eyebrow">Overall health check</p>
              <h3>Workflow health summary</h3>
            </div>
          </div>
          <div className="overall-health-grid">
            <div className="overall-health-card overall-health-warning" aria-label="Duration worsening warning placeholder">
              <h4>Warnings</h4>
            </div>
            <div className="overall-health-card overall-health-danger" aria-label="Failure rate warning placeholder">
              <h4>Failures</h4>
            </div>
            <div className="overall-health-card overall-health-info" aria-label="Workflow status summary placeholder">
              <h4>Overall health</h4>
            </div>
          </div>
        </section>

        <header className="dashboard-header">
          <div>
            <p className="eyebrow">{currentRepo || 'GitHub repository'}</p>
            <h2>GitHub Actions Dashboard</h2>
          </div>

          <div className="header-actions">
            {/* Collection Info */}
            {dataExists && lastUpdated && (
              <div className="collection-meta">
                <span>{existingRunsCount} runs</span>
                <span>Last updated: {new Date(lastUpdated).toLocaleDateString()}</span>
              </div>
            )}
            
            {progress.isStreaming && (
              <div className="collection-meta success">
                {progress.newRuns !== undefined && progress.existingRuns !== undefined && (
                  <>
                    <span>{progress.newRuns} new</span>
                    <span>{progress.existingRuns} existing</span>
                  </>
                )}
              </div>
            )}
            <ThemeToggle
              theme={dashboardTheme}
              onToggle={() => setDashboardTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            />
          </div>
        </header>
        
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
            <div className="filter-group date-range-group" ref={datePickerRef}>
              <label>Date Range</label>
              <button
                className="dropdown-toggle"
                onClick={() => setDatePickerOpen(!datePickerOpen)}
                type="button"
              >
                <span>
                  {filters.start && filters.end 
                    ? (() => {
                        const periodLabel = getDateRangeLabel(filters.start, filters.end);
                        if (periodLabel) {
                          return `Period: ${periodLabel}`;
                        }
                        return `${new Date(filters.start).toLocaleDateString()} - ${new Date(filters.end).toLocaleDateString()}`;
                      })()
                    : 'Select date range...'}
                </span>
                <span className="dropdown-arrow">▼</span>
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
                  <div className="date-picker-popover">
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
          {dataExists && !progress.isStreaming && (
            <div className="filter-action">
              <span>Data</span>
              <button
                onClick={() => loadDashboardData(true)}
                className="primary-action"
                type="button"
              >
                Collect More Data
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="stats-row">
          <MetricCard
            tone="info"
            icon="play"
            title="Total runs"
            value={data.totalRuns}
            note={data.originalTotalRuns !== undefined && data.originalTotalRuns !== data.totalRuns ? `Filtered from ${data.originalTotalRuns} raw runs` : 'Runs executed'}
            explanation={{
                title: 'Total Runs',
                text: 'The total number of workflow runs collected in the selected date range. This includes all runs regardless of their status (success, failure, cancelled, etc.).'
            }}
          >
            <div className="metric-mini total-runs-visual" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.round(((data.totalRuns || 0) / Math.max(data.originalTotalRuns || data.totalRuns || 1, 1)) * 100))}%` }} />
            </div>
          </MetricCard>
          <MetricCard
            tone="success"
            icon="check"
            title="Success rate"
            value={`${(data.successRate * 100).toFixed(1)}%`}
            note={`${Math.round((data.successRate || 0) * (data.totalRuns || 0))} successful`}
            explanation={{
                title: 'Success Rate',
                text: 'The percentage of workflow runs that completed successfully. Calculated as (successful runs / total runs) × 100%. A higher success rate indicates more reliable workflows.'
            }}
          >
            <div className="success-gauge" role="img" aria-label={`Success rate ${(data.successRate * 100).toFixed(1)} percent`}>
              <svg viewBox="0 0 120 70" aria-hidden="true">
                <path className="gauge-track" d="M18 60 A42 42 0 0 1 102 60" />
                <path className="gauge-fill" style={{ strokeDashoffset: 108 - (108 * (data.successRate || 0)) }} d="M18 60 A42 42 0 0 1 102 60" />
              </svg>
            </div>
          </MetricCard>
          <MetricCard
            tone="warning"
            icon="clock"
            title="Median duration"
            value={`${data.medianDuration} s`}
            note="Typical run time"
            explanation={{
                title: 'Median Duration',
                text: 'The median (middle value) execution time of all workflow runs in seconds. The median is less affected by outliers than the average, providing a more representative measure of typical workflow duration.'
            }}
          >
            <svg className="metric-mini duration-sparkline" viewBox="0 0 120 34" role="img" aria-label="Median duration trend">
              <path className="spark-area" d="M4 28 L4 22 C22 26 30 18 42 20 C55 23 62 12 74 15 C88 17 96 9 116 6 L116 34 L4 34 Z" />
              <path className="spark-line" d="M4 22 C22 26 30 18 42 20 C55 23 62 12 74 15 C88 17 96 9 116 6" />
            </svg>
          </MetricCard>
          <MetricCard
            tone="danger"
            icon="pulse"
            title="MAD"
            value={`${data.mad} s`}
            note="Run time variability"
            explanation={{
                title: 'Median Absolute Deviation (MAD)',
                text: 'A measure of variability that shows how spread out the workflow durations are. MAD is the median of the absolute deviations from the median duration. Lower values indicate more consistent execution times, while higher values suggest greater variability.'
            }}
          >
            <div className="metric-mini mad-visual" aria-hidden="true">
              <span style={{ height: '35%' }} />
              <span style={{ height: '58%' }} />
              <span style={{ height: '82%' }} />
              <span style={{ height: '46%' }} />
              <span style={{ height: '72%' }} />
              <span style={{ height: '50%' }} />
            </div>
          </MetricCard>
        </div>

        {/* Charts */}
        <div className="dashboard-grid">
          {/* Statistics Container with Tabs */}
          <div className="card stats-panel">
            <h3 className="stats-title">
              Statistics
              <InfoIcon explanation={{
                title: 'Statistics',
                text: 'Detailed statistics tables showing workflow, job, branch, event trigger, and contributor metrics. Use the tabs to switch between different views. Each table displays total runs, success rates, and other relevant metrics for the selected filters.'
              }} />
            </h3>
            <div className="stats-tabs-wrap">
              <div className="stats-tabs" role="tablist" aria-label="Statistics views">
                <button
                  id="stats-tab-workflows"
                  type="button"
                  role="tab"
                  aria-selected={activeStatsTab === 'workflows'}
                  aria-controls="stats-panel-workflows"
                  className={`stats-tab-button ${activeStatsTab === 'workflows' ? 'active' : ''}`}
                  onClick={() => setActiveStatsTab('workflows')}
                >
                  <span className="tab-icon"><UIIcon name="workflow" /></span>
                  Workflows
                </button>
                <button
                  id="stats-tab-jobs"
                  type="button"
                  role="tab"
                  aria-selected={activeStatsTab === 'jobs'}
                  aria-controls="stats-panel-jobs"
                  className={`stats-tab-button ${activeStatsTab === 'jobs' ? 'active' : ''}`}
                  onClick={() => setActiveStatsTab('jobs')}
                >
                  <span className="tab-icon"><UIIcon name="jobs" /></span>
                  Jobs
                </button>
                <button
                  id="stats-tab-branch"
                  type="button"
                  role="tab"
                  aria-selected={activeStatsTab === 'branch'}
                  aria-controls="stats-panel-branch"
                  className={`stats-tab-button ${activeStatsTab === 'branch' ? 'active' : ''}`}
                  onClick={() => setActiveStatsTab('branch')}
                >
                  <span className="tab-icon"><UIIcon name="branch" /></span>
                  Branch
                </button>
                <button
                  id="stats-tab-events"
                  type="button"
                  role="tab"
                  aria-selected={activeStatsTab === 'events'}
                  aria-controls="stats-panel-events"
                  className={`stats-tab-button ${activeStatsTab === 'events' ? 'active' : ''}`}
                  onClick={() => setActiveStatsTab('events')}
                >
                  <span className="tab-icon"><UIIcon name="events" /></span>
                  Event Triggers
                </button>
                <button
                  id="stats-tab-contributors"
                  type="button"
                  role="tab"
                  aria-selected={activeStatsTab === 'contributors'}
                  aria-controls="stats-panel-contributors"
                  className={`stats-tab-button ${activeStatsTab === 'contributors' ? 'active' : ''}`}
                  onClick={() => setActiveStatsTab('contributors')}
                >
                  <span className="tab-icon"><UIIcon name="contributors" /></span>
                  Contributors
                </button>
              </div>
            </div>
            
            {activeStatsTab === 'workflows' && (
              <div id="stats-panel-workflows" role="tabpanel" aria-labelledby="stats-tab-workflows" className="table-wrapper">
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
                <div id="stats-panel-jobs" role="tabpanel" aria-labelledby="stats-tab-jobs" className="table-wrapper">
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
              <div id="stats-panel-branch" role="tabpanel" aria-labelledby="stats-tab-branch">
                <div className="branch-event-tabs-wrap">
                  <div className="branch-event-tabs" role="tablist" aria-label="Branch event filters">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeBranchEventTab === 'all'}
                      onClick={() => setActiveBranchEventTab('all')}
                      className={`branch-event-tab ${activeBranchEventTab === 'all' ? 'active' : ''}`}
                    >
                      All Events
                    </button>
                    {eventStats.map(e => (
                      <button
                        key={e.name}
                        type="button"
                        role="tab"
                        aria-selected={activeBranchEventTab === e.name}
                        onClick={() => setActiveBranchEventTab(e.name)}
                        className={`branch-event-tab ${activeBranchEventTab === e.name ? 'active' : ''}`}
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
              <div id="stats-panel-events" role="tabpanel" aria-labelledby="stats-tab-events" className="table-wrapper">
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
              <div id="stats-panel-contributors" role="tabpanel" aria-labelledby="stats-tab-contributors">
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
          <div className="card dashboard-chart-card modern-panel">
            <div className="chart-card-header">
              <div>
                <p className="eyebrow">Runs over time</p>
                <h3>
                  Daily runs breakdown
                  <InfoIcon explanation={{
                    title: 'Daily Runs Breakdown',
                    text: 'A stacked bar chart showing the daily count of successful (green) and failed (red) workflow runs over time. This helps identify patterns in workflow execution and failure rates across different days.'
                  }} />
                </h3>
              </div>
              <span className="status-pill success">Daily count</span>
              <PanelControls
                panelId="dailyRuns"
                zoomed={!!dailyRunsZoom}
                onZoom={zoomPanelData}
                onReset={() => resetPanelZoom('dailyRuns')}
              />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={visibleRunsOverTime} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
          <div className="card dashboard-chart-card modern-panel">
            <div className="chart-card-header">
              <div>
                <p className="eyebrow">Duration variability</p>
                <h3>
                  Min, median, max
                  <InfoIcon explanation={{
                    title: 'Duration Variability',
                    text: 'Shows the variability of workflow execution times over time. Displays the minimum (green area), maximum (orange area), and median (blue line) durations. Use the brush at the bottom to zoom into specific time periods. High variability may indicate performance issues or inconsistent resource availability.'
                  }} />
                </h3>
              </div>
              <PanelControls
                panelId="durationVariability"
                zoomed={!!durationVariabilityZoom}
                onZoom={zoomPanelData}
                onReset={() => resetPanelZoom('durationVariability', () => setDurationVariabilityZoom(null))}
              />
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
          <div className="card dashboard-chart-card modern-panel">
            <div className="chart-card-header">
              <div>
                <p className="eyebrow">Failure duration</p>
                <h3>
                  Cumulative failure duration
                  <InfoIcon explanation={{
                    title: 'Cumulative Failure Duration',
                    text: 'Shows the daily failure duration (red bars) and cumulative failure duration (orange line) over time. The cumulative line helps track the total time lost to failures. Use the brush at the bottom to zoom into specific periods. This metric helps quantify the impact of failures on development velocity.'
                  }} />
                </h3>
              </div>
              <span className="status-pill danger">{`${(data.successRate < 1 ? (100 - data.successRate * 100) : 0).toFixed(1)}% failure rate`}</span>
              <PanelControls
                panelId="cumulativeFailure"
                zoomed={!!cumulativeFailureZoom}
                onZoom={zoomPanelData}
                onReset={() => resetPanelZoom('cumulativeFailure', () => setCumulativeFailureZoom(null))}
              />
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
          <div className="card dashboard-chart-card modern-panel">
            <div className="chart-card-header">
              <div>
                <p className="eyebrow">Time to fix</p>
                <h3>
                  Time to Fix (Box Plot)
                  <InfoIcon explanation={{
                    title: 'Time to Fix (Box Plot)',
                    text: 'A box plot visualization showing the distribution of time-to-fix for each workflow. Time-to-fix is calculated from the time a workflow fails until it succeeds again. The box shows the interquartile range (IQR), the line inside is the median, and the whiskers extend to show the full range. Hover over data points to see detailed information including commit links.'
                  }} />
                </h3>
              </div>
              <span className="status-pill warning">{`${topFailedWorkflows.length || timeToFix.length} regressions`}</span>
              <PanelControls
                panelId="timeToFix"
                zoomed={!!timeToFixZoom}
                onZoom={zoomPanelData}
                onReset={() => resetPanelZoom('timeToFix')}
              />
            </div>
            {visibleTimeToFix && visibleTimeToFix.length > 0 ? (
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
                    <div>Min: {formatTimeForTooltip(tooltipData.min)}</div>
                    <div style={{ color: '#2196f3' }}>Q1: {formatTimeForTooltip(tooltipData.q1)}</div>
                    <div style={{ color: '#ff9800', fontWeight: 'bold' }}>Median: {formatTimeForTooltip(tooltipData.median)}</div>
                    <div style={{ color: '#2196f3' }}>Q3: {formatTimeForTooltip(tooltipData.q3)}</div>
                    <div>Max: {formatTimeForTooltip(tooltipData.max)}</div>
                    <div style={{ color: '#4caf50', fontWeight: 'bold', marginTop: '5px' }}>Mean: {formatTimeForTooltip(tooltipData.mean)}</div>
                  </div>
                )}
                <svg width="100%" height="100%" viewBox="0 0 900 320" preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
                  {(() => {
                    const chartWidth = 900;
                    const chartHeight = 320;
                    const margin = { top: 20, right: 30, bottom: 60, left: 120 };
                    const plotWidth = chartWidth - margin.left - margin.right;
                    const plotHeight = chartHeight - margin.top - margin.bottom;
                    
                    // Get the appropriate time unit based on data
                    const timeUnit = getTimeUnit(visibleTimeToFix);
                    
                    // Handle large values by using 95th percentile or reasonable max
                    const allValues = visibleTimeToFix.flatMap(d => [d.min, d.q1, d.median, d.q3, d.max, d.mean].filter(v => v > 0));
                    const sortedValues = [...allValues].sort((a, b) => a - b);
                    const p95Index = Math.floor(sortedValues.length * 0.95);
                    const reasonableMax = sortedValues.length > 0 ? Math.max(sortedValues[p95Index] || sortedValues[sortedValues.length - 1], Math.max(...visibleTimeToFix.map(d => d.max || 0)) * 0.1) : 1;
                    
                    // Convert reasonableMax to the selected unit for display
                    const reasonableMaxInUnit = reasonableMax / timeUnit.divisor;
                    
                    const xScale = reasonableMax > 0 ? plotWidth / reasonableMax : 1;
                    const boxSpacing = plotHeight / (visibleTimeToFix.length + 1);
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
                          const displayValue = value / timeUnit.divisor;
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
                                {displayValue < 10 ? displayValue.toFixed(1) : Math.round(displayValue)}{timeUnit.label}
                              </text>
                            </g>
                          );
                        })}
                        
                        {/* Y-axis labels (workflow names) */}
                        {visibleTimeToFix.map((item, index) => {
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
                        {visibleTimeToFix.map((item, index) => {
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
                                    {formatWithUnit(item.max, timeUnit.divisor, timeUnit.label)}
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
                          Time to Fix ({timeUnit.fullLabel})
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
          <div className="card card-span-2 dashboard-chart-card modern-panel">
            <div className="chart-card-header">
              <div>
                <p className="eyebrow">Workflow duration over time</p>
                <h3>
                  Explosion detection
                  <InfoIcon explanation={{
                    title: 'Workflow Duration Over Time (with Explosion Detection)',
                    text: 'A line chart showing workflow duration trends over time with automatic detection of "duration explosions" - sudden increases in execution time. Worsening points are highlighted with warning indicators. Select a specific workflow from the dropdown to focus on individual workflows. Use the brush to zoom into specific time periods. This helps identify performance regressions and optimization opportunities.'
                  }} />
                </h3>
              </div>
              <div className="chart-header-actions">
                <select 
                  className="compact-select"
                  value={selectedWorkflowForDuration}
                  onChange={(e) => setSelectedWorkflowForDuration(e.target.value)}
                >
                  <option value="all">All Workflows</option>
                  {workflowStats.map(w => (
                    <option key={w.name} value={w.name}>{w.name}</option>
                  ))}
                </select>
                <PanelControls
                  panelId="durationExplosion"
                  zoomed={!!durationExplosionZoom}
                  onZoom={zoomPanelData}
                  onReset={() => resetPanelZoom('durationExplosion', () => {
                    setDurationExplosionBrushKey(prev => prev + 1);
                    setDurationExplosionZoom(null);
                  })}
                />
              </div>
            </div>
            {workflowStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart 
                  data={durationExplosionData} 
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
                            {data.worseningPoint && (
                              <div style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #444' }}>
                                <p style={{ color: '#ff9800', margin: 0, fontWeight: 'bold' }}>⚠️ Worsening Detected</p>
                                <p style={{ color: '#fff', margin: '3px 0', fontSize: '11px' }}>
                                  Previous median: {data.worseningPoint.previousMedian.toFixed(1)}s
                                </p>
                                <p style={{ color: '#fff', margin: '3px 0', fontSize: '11px' }}>
                                  Next median: {data.worseningPoint.nextMedian.toFixed(1)}s
                                </p>
                                {data.worseningPoint.commitSha && (
                                  <p style={{ color: '#bcd', margin: '3px 0', fontSize: '10px', fontFamily: 'monospace' }}>
                                    Commit: {data.worseningPoint.commitSha.substring(0, 7)}
                                  </p>
                                )}
                                <p style={{ color: '#ff9800', margin: '5px 0 0 0', cursor: 'pointer', fontSize: '11px' }} 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     if (data.worseningPoint?.commitUrl) {
                                       window.open(data.worseningPoint.commitUrl, '_blank');
                                     }
                                   }}>
                                  Click to view commit changes
                                </p>
                              </div>
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
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      // Show regular dot for all points
                      if (!payload) return null;
                      
                      // If this is a worsening point, show highlighted dot
                      if (payload.worseningPoint) {
                        const handleClick = (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const url = payload.worseningPoint?.commitUrl || payload.worseningPoint?.html_url;
                          if (url) {
                            window.open(url, '_blank');
                          }
                        };
                        
                        return (
                          <g onClick={handleClick} onMouseDown={handleClick} style={{ cursor: 'pointer' }} pointerEvents="all">
                            {/* Large transparent clickable area */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={15}
                              fill="transparent"
                              pointerEvents="all"
                              style={{ cursor: 'pointer' }}
                            />
                            {/* Outer glow ring */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={12}
                              fill="none"
                              stroke="#ff5722"
                              strokeWidth={2}
                              opacity={0.4}
                              pointerEvents="none"
                            />
                            {/* Highlighted dot */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={8}
                              fill="#ff5722"
                              stroke="#fff"
                              strokeWidth={2}
                              pointerEvents="none"
                            />
                          </g>
                        );
                      }
                      
                      // Regular dot for non-worsening points
                      return <circle cx={cx} cy={cy} r={4} fill="#2196f3" />;
                    }}
                    activeDot={{
                      r: 6,
                      fill: '#2196f3',
                      stroke: '#fff',
                      strokeWidth: 2
                    }}
                  />
                  <Brush 
                    dataKey="date" 
                    height={30}
                    stroke="#8884d8"
                    key={durationExplosionBrushKey}
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
          <div className="card card-span-2 dashboard-chart-card modern-panel">
            <div className="chart-card-header">
              <div>
                <p className="eyebrow">Failure rate over time</p>
                <h3>
                  Worsening detection
                  <InfoIcon explanation={{
                    title: 'Failure Rate Over Time (Worsening Detection)',
                    text: 'A line chart showing the failure rate percentage over time with automatic detection of "worsening" periods - when failure rates increase significantly compared to previous periods. Worsening points are highlighted with warning indicators and include links to the commits that may have caused the issue. Use the brush to zoom into specific time periods. This helps identify when and why workflows started failing more frequently.'
                  }} />
                </h3>
              </div>
              <PanelControls
                panelId="failureWorsening"
                zoomed={!!failureWorseningZoom}
                onZoom={zoomPanelData}
                onReset={() => resetPanelZoom('failureWorsening', () => setFailureWorseningZoom(null))}
              />
            </div>
            {workflowStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart 
                  data={failureWorseningData} 
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
                            {data.worseningPoint && (
                              <div style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #444' }}>
                                <p style={{ color: '#ff5722', margin: 0, fontWeight: 'bold' }}>⚠️ Worsening Detected</p>
                                <p style={{ color: '#fff', margin: '3px 0', fontSize: '11px' }}>
                                  Previous 10 days failures: {data.worseningPoint.previousFailures}
                                </p>
                                <p style={{ color: '#fff', margin: '3px 0', fontSize: '11px' }}>
                                  Next 10 days failures: {data.worseningPoint.nextFailures}
                                </p>
                                {data.worseningPoint.commitSha && (
                                  <p style={{ color: '#bcd', margin: '3px 0', fontSize: '10px', fontFamily: 'monospace' }}>
                                    Commit: {data.worseningPoint.commitSha.substring(0, 7)}
                                  </p>
                                )}
                                <p style={{ color: '#ff5722', margin: '5px 0 0 0', cursor: 'pointer', fontSize: '11px' }} 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     if (data.worseningPoint?.commitUrl) {
                                       window.open(data.worseningPoint.commitUrl, '_blank');
                                     }
                                   }}>
                                  Click to view commit changes
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="failureRate" fill="#f44336" fillOpacity={0.3} stroke="#f44336" name="Failure Rate" />
                  {/* Line for failure rate with worsening points highlighted */}
                  <Line
                    type="monotone"
                    dataKey="failureRate"
                    stroke="#f44336"
                    strokeWidth={2}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (!payload) return null;
                      
                      // If this is a worsening point, show highlighted dot
                      if (payload.worseningPoint) {
                        const handleClick = (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const url = payload.worseningPoint?.commitUrl || payload.worseningPoint?.html_url;
                          if (url) {
                            window.open(url, '_blank');
                          }
                        };
                        
                        return (
                          <g onClick={handleClick} onMouseDown={handleClick} style={{ cursor: 'pointer' }} pointerEvents="all">
                            {/* Large transparent clickable area */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={15}
                              fill="transparent"
                              pointerEvents="all"
                              style={{ cursor: 'pointer' }}
                            />
                            {/* Outer glow ring */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={12}
                              fill="none"
                              stroke="#ff5722"
                              strokeWidth={2}
                              opacity={0.4}
                              pointerEvents="none"
                            />
                            {/* Highlighted dot */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={8}
                              fill="#ff5722"
                              stroke="#fff"
                              strokeWidth={2}
                              pointerEvents="none"
                            />
                          </g>
                        );
                      }
                      
                      // Regular small dot for non-worsening points
                      return <circle cx={cx} cy={cy} r={3} fill="#f44336" opacity={0.6} />;
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
