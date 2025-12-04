import { useEffect, useState, useRef } from 'react';
import { fetchDashboardData } from '../api';
import { fetchDashboardDataViaWebSocket, clearWebSocketCache, filterRunsLocally, getAllRuns } from '../websocket';
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
  Area
} from 'recharts';

const COLORS = ['#4caf50', '#f44336', '#ff9800', '#2196f3', '#9c27b0', '#00bcd4'];
const USE_WEBSOCKET = true;

function formatDateForInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function Dashboard() {
  const getCurrentDefaults = () => {
    const now = new Date();
    const defaultEnd = formatDateForInput(now);
    const defaultStart = formatDateForInput(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    return { defaultStart, defaultEnd };
  };

  const { defaultStart, defaultEnd } = getCurrentDefaults();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState({ items: 0, complete: false, isStreaming: false });
  
  // Options disponibles pour les filtres
  const [availableFilters, setAvailableFilters] = useState({
    workflows: ['all'],
    branches: ['all'],
    actors: ['all']
  });
  
  const [filters, setFilters] = useState({
    workflow: ['all'],
    branch: ['all'],
    actor: ['all'],
    start: defaultStart,
    end: defaultEnd
  });

  // Track si les donnees initiales sont chargees
  const [dataLoaded, setDataLoaded] = useState(false);
  const prevDatesRef = useRef({ start: defaultStart, end: defaultEnd });

  const [openDropdowns, setOpenDropdowns] = useState({
    workflow: false,
    branch: false,
    actor: false
  });

  const dropdownRefs = {
    workflow: useRef(null),
    branch: useRef(null),
    actor: useRef(null)
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      Object.keys(dropdownRefs).forEach(key => {
        if (dropdownRefs[key].current && !dropdownRefs[key].current.contains(event.target)) {
          setOpenDropdowns(prev => ({ ...prev, [key]: false }));
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Charger les donnees (seulement quand les dates changent)
  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    setProgress({ items: 0, complete: false, isStreaming: true });
    setDataLoaded(false);
    
    try {
      const repo = await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
          // Get the active tab and use its per-tab repo key
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs && tabs[0];
            if (activeTab && typeof activeTab.id === 'number' && chrome.storage) {
              const key = `currentRepo_${activeTab.id}`;
              chrome.storage.local.get([key], (result) => {
                resolve(result[key] || 'facebook/react');
              });
            } else if (chrome.storage) {
              chrome.storage.local.get(['currentRepo'], (result) => {
                resolve(result.currentRepo || 'facebook/react');
              });
            } else {
              resolve('facebook/react');
            }
          });
        } else if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get(['currentRepo'], (result) => {
            resolve(result.currentRepo || 'facebook/react');
          });
        } else {
          resolve('facebook/react');
        }
      });

      if (USE_WEBSOCKET) {
        clearWebSocketCache(repo);
        
        const onProgress = (partialData, isComplete) => {
          // Sauvegarder les options de filtres
          if (partialData.workflows && partialData.workflows.length > 1) {
            setAvailableFilters({
              workflows: partialData.workflows,
              branches: partialData.branches || ['all'],
              actors: partialData.actors || ['all']
            });
          }
          
          // Appliquer les filtres locaux
          const filteredData = applyLocalFilters(partialData);
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
        
        const wsFilters = {
          start: filters.start,
          end: filters.end
        };
        
        await fetchDashboardDataViaWebSocket(repo, wsFilters, onProgress);
        
      } else {
        const result = await fetchDashboardData(filters);
        setData(result);
        setLoading(false);
        setDataLoaded(true);
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Error loading data: ' + err.message);
      setLoading(false);
      setProgress({ items: 0, complete: true, isStreaming: false });
    }
  };

  // Appliquer les filtres locaux
  const applyLocalFilters = (rawData) => {
    if (!rawData) return rawData;
    
    // Si tous les filtres sont "all", retourner tel quel
    if (filters.workflow.includes('all') && 
        filters.branch.includes('all') && 
        filters.actor.includes('all')) {
      return rawData;
    }
    
    // Utiliser la fonction de filtrage du websocket
    const filtered = filterRunsLocally({
      workflow: filters.workflow,
      branch: filters.branch,
      actor: filters.actor
    });
    
    if (filtered) {
      // Garder les options de filtres originales
      return {
        ...filtered,
        workflows: rawData.workflows,
        branches: rawData.branches,
        actors: rawData.actors
      };
    }
    
    return rawData;
  };

  // Charger quand les DATES changent
  useEffect(() => {
    const datesChanged = prevDatesRef.current.start !== filters.start || 
                         prevDatesRef.current.end !== filters.end;
    
    if (datesChanged || !dataLoaded) {
      prevDatesRef.current = { start: filters.start, end: filters.end };
      loadDashboardData();
    }
  }, [filters.start, filters.end]);

  // Appliquer filtres quand workflow/branch/actor changent
  useEffect(() => {
    if (dataLoaded && getAllRuns().length > 0) {
      const filtered = filterRunsLocally({
        workflow: filters.workflow,
        branch: filters.branch,
        actor: filters.actor
      });
      
      if (filtered) {
        // Garder les options de filtres originales
        setData(prev => ({
          ...filtered,
          workflows: availableFilters.workflows,
          branches: availableFilters.branches,
          actors: availableFilters.actors
        }));
      }
    }
  }, [filters.workflow, filters.branch, filters.actor, dataLoaded]);

  if (loading && !data) {
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
  if (!data) return null;
  if (data.noData) return <div className="dashboard dark container" style={{ textAlign: 'center', padding: '2rem' }}>
    <h2>No Data Available</h2>
    <p>{data.message}</p>
  </div>;

  const { 
    runsOverTime = [], 
    statusBreakdown = [], 
    branchComparison = [],
    workflowStats = [],
    topFailedWorkflows = [],
    failureDurationOverTime = []
  } = data;
  
  const { workflows, branches, actors } = availableFilters;
  
  const totalStatus = statusBreakdown.reduce((sum, s) => sum + (s.value || 0), 0);
  const statusData = statusBreakdown.map(s => ({
    ...s,
    percent: totalStatus ? Math.round((s.value / totalStatus) * 100) : 0
  }));
  
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

  return (
    <div className="dashboard dark">
      <div className="container">
        {/* Indicateur de streaming */}
        {progress.isStreaming && (
          <div style={{ 
            padding: '15px 20px', 
            background: 'linear-gradient(90deg, #ff9800 0%, #f44336 100%)',
            color: 'white',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="spinner" style={{ 
                border: '3px solid rgba(255,255,255,0.3)',
                borderTop: '3px solid white',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                animation: 'spin 1s linear infinite'
              }}></div>
              <span style={{ fontWeight: 600 }}>Streaming data from GitHub API...</span>
            </div>
            <span style={{ 
              background: 'rgba(255,255,255,0.2)', 
              padding: '4px 12px', 
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 700
            }}>
              {progress.items} runs received
            </span>
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

            {/* Dates */}
            <div className="filter-group">
              <label>Period start</label>
              <input
                type="datetime-local"
                value={filters.start}
                max={filters.end || defaultEnd}
                onChange={(e) => handleFilterChange('start', e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>Period end</label>
              <input
                type="datetime-local"
                value={filters.end}
                min={filters.start}
                max={defaultEnd}
                onChange={(e) => handleFilterChange('end', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card card">
            <div className="title">Repository</div>
            <div className="value">{data.repo}</div>
          </div>
          <div className="stat-card card">
            <div className="title">Total runs</div>
            <div className="value">{data.totalRuns}</div>
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
            <div className="title">Std deviation</div>
            <div className="value">{`${data.stdDeviation} s`}</div>
          </div>
        </div>

        {/* Charts */}
        <div className="dashboard-grid">
          {/* Status breakdown */}
          <div className="card">
            <h3>Status breakdown</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ x, y, payload }) => (
                    <text x={x} y={y} textAnchor="middle" fill="#fff">
                      <tspan fontSize={12} fontWeight={700}>{payload.percent}%</tspan>
                      <tspan x={x} dy={14} fontSize={10} fill="#9aa">{payload.name}</tspan>
                    </text>
                  )}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Branch statistics table */}
          <div className="card">
            <h3>Branch statistics</h3>
            <div className="table-wrapper">
              <table className="branch-table">
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Runs</th>
                    <th>Success</th>
                    <th>Duration</th>
                    <th>Failures</th>
                  </tr>
                </thead>
                <tbody>
                  {branchComparison.map(b => (
                    <tr key={b.branch}>
                      <td className="branch-name">{b.branch}</td>
                      <td>{b.totalRuns}</td>
                      <td className={b.successRate > 90 ? 'success-high' : b.successRate > 70 ? 'success-medium' : 'success-low'}>
                        {b.successRate}%
                      </td>
                      <td>{b.medianDuration}s</td>
                      <td className={b.failures > 5 ? 'failures-high' : ''}>{b.failures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Workflow success/failure histogram */}
          <div className="card card-span-2">
            <h3>Workflow success/failure breakdown</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={workflowStats} margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="name" stroke="#bcd" angle={-45} textAnchor="end" height={80} interval={0} />
                <YAxis stroke="#bcd" />
                <Tooltip />
                <Legend />
                <Bar dataKey="successes" stackId="a" fill="#4caf50" name="Successes" />
                <Bar dataKey="failures" stackId="a" fill="#f44336" name="Failures" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Daily runs */}
          <div className="card">
            <h3>Daily runs breakdown</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={runsOverTime} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="date" stroke="#bcd" />
                <YAxis stroke="#bcd" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="successes" stroke="#4caf50" strokeWidth={2} name="Successes" />
                <Line type="monotone" dataKey="failures" stroke="#f44336" strokeWidth={2} name="Failures" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Duration over time */}
          <div className="card">
            <h3>Duration variability</h3>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={runsOverTime} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="date" stroke="#bcd" />
                <YAxis stroke="#bcd" label={{ value: 'Duration (s)', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="maxDuration" fill="#ff980030" stroke="#ff9800" name="Max" />
                <Area type="monotone" dataKey="minDuration" fill="#4caf5030" stroke="#4caf50" name="Min" />
                <Line type="monotone" dataKey="medianDuration" stroke="#2196f3" strokeWidth={3} name="Median" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

{/* Cumulative failure duration */}
          <div className="card">
            <h3>Cumulative failure duration</h3>
            {failureDurationOverTime && failureDurationOverTime.length > 0 && 
             failureDurationOverTime.some(item => (item.dailyFailureDuration || 0) > 0 || (item.cumulativeFailureDuration || 0) > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={failureDurationOverTime} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                  <XAxis dataKey="date" stroke="#bcd" />
                  <YAxis stroke="#bcd" label={{ value: 'Duration (s)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="dailyFailureDuration" fill="#f44336" name="Daily failure duration" />
                  <Line type="monotone" dataKey="cumulativeFailureDuration" stroke="#ff9800" strokeWidth={2} name="Cumulative" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                No workflows with failures in the selected period
              </div>
            )}
          </div>

          {/* Top failed workflows */}
          <div className="card">
            <h3>Top failed workflows</h3>
            {topFailedWorkflows && topFailedWorkflows.length > 0 && 
             topFailedWorkflows.some(item => (item.failures || 0) > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topFailedWorkflows} layout="vertical" margin={{ top: 10, right: 20, left: 100, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                  <XAxis type="number" stroke="#bcd" />
                  <YAxis type="category" dataKey="name" stroke="#bcd" width={90} />
                  <Tooltip />
                  <Bar dataKey="failures" fill="#f44336" name="Failures" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                No workflows with failures in the selected period
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
