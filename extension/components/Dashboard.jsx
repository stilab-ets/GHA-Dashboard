import { useEffect, useState, useRef } from 'react';
import { fetchDashboardData } from '../api';
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
  BarChart,
  Bar,
  Legend,
  ComposedChart,
  Area,
  Scatter
} from 'recharts';

const COLORS = ['#4caf50', '#f44336', '#ff9800', '#2196f3'];

// helper to format JS Date for <input type="datetime-local"> (YYYY-MM-DDTHH:MM)
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
  // Calculate current time defaults dynamically
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
  
  // UC-02: Filter state
  const [filters, setFilters] = useState({
    // store multi-selects as arrays; use ['all'] as sentinel meaning no filter
    workflow: ['all'],
    branch: ['all'],
    actor: ['all'],
    // ISO-like local strings for datetime-local inputs
    start: defaultStart,
    end: defaultEnd
  });

  // UC-02: Dropdown open/close state
  const [openDropdowns, setOpenDropdowns] = useState({
    workflow: false,
    branch: false,
    actor: false
  });

  // Refs for dropdown containers to detect clicks outside
  const dropdownRefs = {
    workflow: useRef(null),
    branch: useRef(null),
    actor: useRef(null)
  };

  // Handle clicks outside dropdowns to close them
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

  useEffect(() => {
    fetchDashboardData(filters)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setError('Error loading data.');
        setLoading(false);
      });
  }, [filters]);

  if (loading) return <div className="dashboard dark container">Loading...</div>;
  if (error) return <div className="dashboard dark container" style={{ color: 'var(--accent)' }}>{error}</div>;
  if (!data) return null;

  const { 
    runsOverTime = [], 
    statusBreakdown = [], 
    topWorkflows = [], 
    durationBox = [],
    failureRateOverTime = [],
    branchComparison = [],
    spikes = [],
    workflows = [],
    branches = [],
    actors = []
  } = data;
  // compute percent for status breakdown so we can show it in the legend
  const totalStatus = statusBreakdown.reduce((sum, s) => sum + (s.value || 0), 0);
  const statusData = statusBreakdown.map(s => ({
    ...s,
    percent: totalStatus ? Math.round((s.value / totalStatus) * 100) : 0
  }));
  
  // prepare branch comparison data with workflow information
  const branchData = branchComparison.map(b => ({
    ...b,
    displayBranch: b.workflow ? `${b.workflow}/${b.branch}` : b.branch
  }));
  
  // UC-02: Filter handlers
  const handleFilterChange = (filterType, value) => {
    // For start/end we sanitize to ensure start <= end and neither is in the future
    if (filterType === 'start' || filterType === 'end') {
      const currentDefaults = getCurrentDefaults();
      const nowStr = currentDefaults.defaultEnd; // formatted 'now' (updated in real-time)
      let newStart = filterType === 'start' ? value : filters.start;
      let newEnd = filterType === 'end' ? value : filters.end;

      // clamp to now
      if (newStart > nowStr) newStart = nowStr;
      if (newEnd > nowStr) newEnd = nowStr;

      // ensure start <= end
      if (newStart > newEnd) {
        // if user changed start to after end, move end forward to match start
        newEnd = newStart;
      } else if (newEnd < newStart) {
        // if user changed end to before start, move start back to match end
        newStart = newEnd;
      }

      setFilters(prev => ({ ...prev, start: newStart, end: newEnd }));
      return;
    }

    setFilters(prev => ({ ...prev, [filterType]: value }));
  };

  // for selects that allow multiple values
  const handleMultiChange = (filterType, e) => {
    const selected = Array.from(e.target.selectedOptions).map(o => o.value);
    // if 'all' is selected, treat it as the only value
    const values = selected.includes('all') ? ['all'] : selected.length ? selected : ['all'];
    setFilters(prev => ({ ...prev, [filterType]: values }));
  };

  // checkbox-based multi-select toggler
  const toggleCheckbox = (filterType, value, checked) => {
    setFilters(prev => {
      const prevVals = Array.isArray(prev[filterType]) ? prev[filterType] : ['all'];

      let newVals = [];
      if (value === 'all') {
        newVals = checked ? ['all'] : [];
      } else {
        if (checked) {
          // add value, ensure 'all' removed
          newVals = Array.from(new Set([...prevVals.filter(v => v !== 'all'), value]));
        } else {
          // remove value
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
        <h2 style={{ marginTop: 0 }}>GitHub Actions Dashboard</h2>

        {/* UC-02: Filter Panel */}
        <div className="filter-panel card">
          <div className="filter-row">
            {/* Workflow Dropdown */}
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
                    {workflows.map(w => (
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

            {/* Branch Dropdown */}
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
                    {branches.map(b => (
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

            {/* Actor Dropdown */}
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
                    {actors.map(a => (
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

        {/* UC-01: Core Statistics */}
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

        {/* Main grid layout - 2 columns */}
        <div className="dashboard-grid">
          {/* UC-01: Status breakdown */}
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
                    // custom label: large percent with small sublabel for name
                    label={(entry) => {
                      try {
                        const x = entry.x || entry.cx;
                        const y = entry.y || entry.cy;
                        const pct = (entry.payload && typeof entry.payload.percent === 'number') ? entry.payload.percent : entry.percent * 100;
                        const pctText = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(pct) + '%';
                        return (
                          <text x={x} y={y} textAnchor="middle" fill="#fff">
                            <tspan fontSize={12} fontWeight={700}>{pctText}</tspan>
                            <tspan x={x} dy={14} fontSize={10} fill="#9aa">{entry.payload && entry.payload.name}</tspan>
                          </text>
                        );
                      } catch (e) {
                        return null;
                      }
                    }}
                  >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend formatter={(value, entry) => {
                  const pct = entry && entry.payload && typeof entry.payload.percent === 'number' ? entry.payload.percent : null;
                  const pctText = pct !== null ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(pct)}%` : '';
                  return `${value}: ${pctText}`;
                }} />
                <Tooltip/>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* UC-03: Branch statistics table */}
          <div className="card">
            <h3>Branch statistics details</h3>
            <div className="table-wrapper">
              <table className="branch-table">
                <thead>
                  <tr>
                    <th>Workflow</th>
                    <th>Branch</th>
                    <th>Runs</th>
                    <th>Success</th>
                    <th>Duration</th>
                    <th>Failures</th>
                  </tr>
                </thead>
                <tbody>
                  {branchData.map(b => (
                    <tr key={`${b.workflow || 'unknown'}-${b.branch}`}>
                      <td className="workflow-name">{b.workflow || 'Unknown'}</td>
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

          {/* UC-03: Branch comparison chart */}
          <div className="card card-span-2">
            <h3>Branch performance comparison</h3>
            <p className="chart-description">Success rate and median duration by branch</p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={branchData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="displayBranch" stroke="#bcd" angle={-15} textAnchor="end" height={80} />
                <YAxis yAxisId="left" stroke="#bcd" label={{ value: 'Success %', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#bcd" label={{ value: 'Duration (s)', angle: 90, position: 'insideRight' }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="successRate" fill="#4caf50" name="Success rate %" />
                <Bar yAxisId="right" dataKey="medianDuration" fill="#2196f3" name="Median duration (s)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* UC-01: Daily runs breakdown */}
          <div className="card">
            <h3>Daily runs breakdown</h3>
            <p className="chart-description">Successful and failed runs over time</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={runsOverTime} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="date" stroke="#bcd" />
                <YAxis stroke="#bcd" />
                <Tooltip content={<RunsBreakdownTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="successes" stroke="#4caf50" strokeWidth={3} dot={{ r: 4 }} name="Successful runs" />
                <Line type="monotone" dataKey="failures" stroke="#f44336" strokeWidth={3} dot={{ r: 4 }} name="Failed runs" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* UC-06: Duration chart */}
          <div className="card">
            <h3>Duration variability over time</h3>
            <p className="chart-description">Median duration with min/max range visualization</p>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={runsOverTime} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="date" stroke="#bcd" />
                <YAxis stroke="#bcd" label={{ value: 'Duration (s)', angle: -90, position: 'insideLeft' }} />
                <Tooltip content={<DurationTooltip />} />
                <Legend />
                {/* High-low lines (min to max) */}
                <Line type="monotone" dataKey="maxDuration" stroke="#ff9800" strokeWidth={1} dot={false} name="Max duration" />
                <Line type="monotone" dataKey="minDuration" stroke="#4caf50" strokeWidth={1} dot={false} name="Min duration" />
                {/* Median duration line */}
                <Line type="monotone" dataKey="medianDuration" stroke="#2196f3" strokeWidth={3} dot={{ r: 4 }} name="Median duration" />
                {/* Average duration as reference */}
                <Line type="monotone" dataKey="avgDuration" stroke="#9c27b0" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Average duration" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function RunsBreakdownTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const totalRuns = data.runs || (data.successes + data.failures);
    const successes = data.successes || 0;
    const failures = data.failures || 0;
    
    return (
      <div className="custom-tooltip">
        <p className="label">{`Date: ${label}`}</p>
        <p>{`Total runs: ${totalRuns}`}</p>
        <p style={{ color: '#4caf50' }}>{`Successful: ${successes}`}</p>
        <p style={{ color: '#f44336' }}>{`Failed: ${failures}`}</p>
      </div>
    );
  }
  return null;
}

function DurationTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    
    return (
      <div className="custom-tooltip">
        <p className="label">{`Date: ${label}`}</p>
        <p style={{ color: '#2196f3', fontWeight: 'bold' }}>{`Median: ${data.medianDuration}s`}</p>
        <p style={{ color: '#9c27b0' }}>{`Average: ${data.avgDuration}s`}</p>
        <p style={{ color: '#ff9800' }}>{`Maximum: ${data.maxDuration}s`}</p>
        <p style={{ color: '#4caf50' }}>{`Minimum: ${data.minDuration}s`}</p>
        <p style={{ color: '#666', fontSize: '12px' }}>
          Range: {(data.maxDuration - data.minDuration).toFixed(1)}s
        </p>
      </div>
    );
  }
  return null;
}
