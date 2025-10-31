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
  Legend
} from 'recharts';

const COLORS = ['#4caf50', '#f44336', '#ff9800', '#2196f3'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData()
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setError('Error loading data.');
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="dashboard dark container">Loading...</div>;
  if (error) return <div className="dashboard dark container" style={{ color: 'var(--accent)' }}>{error}</div>;
  if (!data) return null;

  const { runsOverTime = [], statusBreakdown = [], topWorkflows = [], durationBox = [] } = data;

  return (
    <div className="dashboard dark">
      <div className="container">
        <h2 style={{ marginTop: 0 }}>GitHub Actions Dashboard</h2>

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
            <div className="title">Avg duration</div>
            <div className="value">{`${data.avgDuration} s`}</div>
          </div>
        </div>

        <div className="layout-grid">
          <div className="card">
            <h3>Runs over time</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={runsOverTime} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis dataKey="date" stroke="#bcd" />
                <YAxis stroke="#bcd" />
                <Tooltip />
                <Line type="monotone" dataKey="runs" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3>Status breakdown</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="layout-grid-2">
          <div className="card">
            <h3>Top workflows (runs)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topWorkflows} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#122" />
                <XAxis type="number" stroke="#bcd" />
                <YAxis dataKey="name" type="category" stroke="#bcd" />
                <Tooltip />
                <Bar dataKey="runs" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3>Workflow durations</h3>
            <div className="box-plot-wrapper">
              <BoxPlot data={durationBox} height={200} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={{ background: '#fff', padding: 12, borderRadius: 8, minWidth: 160, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function BoxPlot({ data = [], height = 200 }) {
  if (!data || data.length === 0) return <div style={{ color: '#666' }}>No duration data</div>;

  // Flatten values to compute global domain
  const values = data.reduce((acc, d) => acc.concat([d.min, d.q1, d.median, d.q3, d.max]), []);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  const padding = { left: 80, right: 24, top: 12, bottom: 12 };
  const innerWidth = 600; // we'll use viewBox to scale horizontally
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
