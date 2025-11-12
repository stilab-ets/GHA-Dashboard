import { useEffect, useState } from 'react';
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
              <div className="dropdown-container">
                <button
                  className="dropdown-toggle"
                  onClick={() => setOpenDropdowns(prev => ({ ...prev, workflow: !prev.workflow }))}
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
              <div className="dropdown-container">
                <button
                  className="dropdown-toggle"
                  onClick={() => setOpenDropdowns(prev => ({ ...prev, branch: !prev.branch }))}
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
              <div className="dropdown-container">
                <button
                  className="dropdown-toggle"
                  onClick={() => setOpenDropdowns(prev => ({ ...prev, actor: !prev.actor }))}
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
          
          {/* UC-01: Runs over time */}
          <div className="card">
            <h3>Runs over time</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={runsOverTime} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="date" stroke="#bcd" />
                <YAxis stroke="#bcd" />
                <Tooltip />
                <Line type="monotone" dataKey="runs" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

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
                  // custom label to show name + percent
                  label={(entry) => `${entry.name} (${entry.payload.percent}%)`}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend formatter={(value, entry) => `${value} (${entry.payload.percent}%)`} />
                <Tooltip content={<StatusPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* UC-03: Branch comparison chart */}
          <div className="card">
            <h3>Branch performance comparison</h3>
            <p className="chart-description">Success rate and median duration by branch</p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={branchComparison} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="branch" stroke="#bcd" angle={-15} textAnchor="end" height={80} />
                <YAxis yAxisId="left" stroke="#bcd" label={{ value: 'Success %', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#bcd" label={{ value: 'Duration (s)', angle: 90, position: 'insideRight' }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="successRate" fill="#4caf50" name="Success rate %" />
                <Bar yAxisId="right" dataKey="medianDuration" fill="#2196f3" name="Median duration (s)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* UC-03: Branch statistics table */}
          <div className="card">
            <h3>Branch statistics details</h3>
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

          {/* UC-06: Duration variability over time */}
          <div className="card">
            <h3>Duration variability over time</h3>
            <p className="chart-description">Min, median, and max duration evolution</p>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={runsOverTime} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="date" stroke="#bcd" />
                <YAxis stroke="#bcd" label={{ value: 'Duration (s)', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="maxDuration" fill="#ff9800" fillOpacity={0.1} stroke="none" name="Max" />
                <Area type="monotone" dataKey="minDuration" fill="#4caf50" fillOpacity={0.1} stroke="none" name="Min" />
                <Line type="monotone" dataKey="medianDuration" stroke="#2196f3" strokeWidth={2} name="Median" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* UC-06: Workflow durations (Box plot) */}
          <div className="card">
            <h3>Workflow duration distribution</h3>
            <div className="box-plot-wrapper">
              <BoxPlot data={durationBox} height={280} />
            </div>
          </div>

          {/* UC-01: Top workflows */}
          <div className="card">
            <h3>Top workflows (by runs)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topWorkflows} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis type="number" stroke="#bcd" />
                <YAxis dataKey="name" type="category" stroke="#bcd" width={80} />
                <Tooltip />
                <Bar dataKey="runs" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* UC-05: Failure rate over time */}
          <div className="card">
            <h3>Failure rate trends</h3>
            <p className="chart-description">Evolution of failure rates over time</p>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={failureRateOverTime} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="date" stroke="#bcd" />
                <YAxis yAxisId="left" stroke="#bcd" label={{ value: 'Failure %', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#bcd" label={{ value: 'Runs', angle: 90, position: 'insideRight' }} />
                <Tooltip />
                <Legend />
                <Area yAxisId="right" type="monotone" dataKey="totalRuns" fill="#60a5fa" fillOpacity={0.2} stroke="none" name="Total runs" />
                <Line yAxisId="left" type="monotone" dataKey="failureRate" stroke="#f44336" strokeWidth={3} dot={{ r: 4 }} name="Failure rate %" />
                <Line yAxisId="left" type="monotone" dataKey="avgFailureRate" stroke="#ff9800" strokeWidth={2} strokeDasharray="5 5" name="Average" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* UC-07: Spike detection */}
          <div className="card card-span-2">
            <h3>Anomaly detection - Execution & failure spikes</h3>
            <p className="chart-description">Identify abnormal peaks in executions or failures</p>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={spikes} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="date" stroke="#bcd" />
                <YAxis yAxisId="left" stroke="#bcd" label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#bcd" label={{ value: 'Duration (s)', angle: 90, position: 'insideRight' }} />
                <Tooltip content={<CustomSpikeTooltip />} />
                <Legend />
                <Bar yAxisId="left" dataKey="runs" fill="#60a5fa" name="Total runs" />
                <Bar yAxisId="left" dataKey="failures" fill="#f44336" name="Failures" />
                <Line yAxisId="right" type="monotone" dataKey="medianDuration" stroke="#ff9800" strokeWidth={2} name="Median duration" />
                <Scatter yAxisId="left" dataKey="anomalyScore" fill="#ff0000" name="Anomaly" />
              </ComposedChart>
            </ResponsiveContainer>
            {spikes.filter(s => s.isAnomaly).length > 0 && (
              <div className="spike-list-inline">
                <h4>Detected Anomalies:</h4>
                <div className="spike-items-grid">
                  {spikes.filter(s => s.isAnomaly).map((spike, idx) => (
                    <div key={idx} className="spike-item-inline">
                      <span className="spike-date">{spike.date}</span>
                      <span className="spike-type">{spike.anomalyType}</span>
                      <span className="spike-detail">{spike.anomalyDetail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomSpikeTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="custom-tooltip">
        <p className="label">{`Date: ${data.date}`}</p>
        <p>{`Runs: ${data.runs}`}</p>
        <p>{`Failures: ${data.failures}`}</p>
        <p>{`Median Duration: ${data.medianDuration}s`}</p>
        {data.isAnomaly && <p className="anomaly-flag">⚠️ Anomaly detected</p>}
      </div>
    );
  }
  return null;
}

function StatusPieTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="custom-tooltip">
        <p className="label">{`${data.name}`}</p>
        <p>{`Value: ${data.value}`}</p>
        <p>{`Percent: ${data.percent}%`}</p>
      </div>
    );
  }
  return null;
}

function BoxPlot({ data = [], height = 200 }) {
  if (!data || data.length === 0) return <div style={{ color: '#666' }}>No duration data</div>;

  // Flatten values to compute global domain
  const values = data.reduce((acc, d) => acc.concat([d.min, d.q1, d.median, d.q3, d.max]), []);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  const padding = { left: 80, right: 24, top: 12, bottom: 12 };
  const innerWidth = 600; // use viewBox to scale horizontally
  const w = padding.left + innerWidth + padding.right;
  const h = Math.max(height, data.length * 40) + padding.top + padding.bottom;

  const rowHeight = (h - padding.top - padding.bottom) / data.length;
  const boxHeight = Math.min(18, rowHeight * 0.6);

  const xFor = (v) => {
    if (maxVal === minVal) return padding.left + innerWidth / 2;
    return padding.left + ((v - minVal) / (maxVal - minVal)) * innerWidth;
  };

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMinYMin meet">
      {/* labels on left */}
      {data.map((d, i) => {
        const y = padding.top + i * rowHeight + rowHeight / 2;
        const minX = xFor(d.min);
        const q1X = xFor(d.q1);
        const medX = xFor(d.median);
        const q3X = xFor(d.q3);
        const maxX = xFor(d.max);

        return (
          <g key={d.name}>
            {/* workflow name */}
            <text x={12} y={y + 5} fontSize={12} fill="#222">{d.name}</text>

            {/* whisker line */}
            <line x1={minX} x2={maxX} y1={y} y2={y} stroke="#888" strokeWidth={2} />

            {/* caps */}
            <line x1={minX} x2={minX} y1={y - 8} y2={y + 8} stroke="#888" strokeWidth={2} />
            <line x1={maxX} x2={maxX} y1={y - 8} y2={y + 8} stroke="#888" strokeWidth={2} />

            {/* box */}
            <rect x={q1X} y={y - boxHeight / 2} width={Math.max(2, q3X - q1X)} height={boxHeight} fill="#2196f3" fillOpacity={0.15} stroke="#2196f3" />

            {/* median */}
            <line x1={medX} x2={medX} y1={y - boxHeight / 2} y2={y + boxHeight / 2} stroke="#2196f3" strokeWidth={2} />

            {/* numeric labels on right */}
            <text x={w - padding.right + 4} y={y + 5} fontSize={11} fill="#444">{d.median}s</text>
          </g>
        );
      })}

      {/* x-axis ticks */}
      <g>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = minVal + t * (maxVal - minVal);
          const x = xFor(v);
          return (
            <g key={t}>
              <line x1={x} x2={x} y1={h - padding.bottom} y2={h - padding.bottom + 6} stroke="#ccc" />
              <text x={x} y={h - padding.bottom + 20} fontSize={11} textAnchor="middle" fill="#666">{Math.round(v)}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
