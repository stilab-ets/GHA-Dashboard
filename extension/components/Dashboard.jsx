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

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // UC-02: Filter state
  const [filters, setFilters] = useState({
    workflow: 'all',
    branch: 'all',
    actor: 'all',
    period: '30d'
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
  
  // UC-02: Filter handler
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
  };

  return (
    <div className="dashboard dark">
      <div className="container">
        <h2 style={{ marginTop: 0 }}>GitHub Actions Dashboard</h2>

        {/* UC-02: Filter Panel */}
        <div className="filter-panel card">
          <div className="filter-row">
            <div className="filter-group">
              <label>Workflow</label>
              <select value={filters.workflow} onChange={(e) => handleFilterChange('workflow', e.target.value)}>
                <option value="all">All workflows</option>
                {workflows.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Branch</label>
              <select value={filters.branch} onChange={(e) => handleFilterChange('branch', e.target.value)}>
                <option value="all">All branches</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Actor</label>
              <select value={filters.actor} onChange={(e) => handleFilterChange('actor', e.target.value)}>
                <option value="all">All actors</option>
                {actors.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>Period</label>
              <select value={filters.period} onChange={(e) => handleFilterChange('period', e.target.value)}>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="6m">Last 6 months</option>
              </select>
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
                <Pie data={statusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {statusBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
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
