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
  ComposedChart
} from 'recharts';

const COLORS = ['#4caf50', '#f44336', '#ff9800', '#2196f3'];

// Helper : format YYYY-MM-DDTHH:MM
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

  // 🔥 EXTRACTION BUTTON FUNCTION (PLACED CORRECTLY)
  async function handleExtract() {
    const repo = data?.repo;

    if (!repo) {
      alert("❌ Aucun repo détecté.");
      return;
    }

    alert("⏳ Extraction en cours pour : " + repo);

    try {
      const res = await fetch(
        `http://localhost:3000/api/sync?repo=${repo}`,
        { method: "POST" }
      );

      const json = await res.json();
      console.log("Extraction result:", json);

      if (json.error) {
        alert("❌ Erreur: " + json.error);
      } else {
        alert(`✅ Extraction terminée !
Insertions: ${json.inserted}
Ignorés: ${json.skipped}`);
      }

    } catch (err) {
      console.error(err);
      alert("❌ Erreur backend (voir console)");
    }
  }

  const getCurrentDefaults = () => {
    const now = new Date();
    const defaultEnd = formatDateForInput(now);
    const defaultStart = formatDateForInput(new Date(now.getTime() - 30 * 86400000));
    return { defaultStart, defaultEnd };
  };

  const { defaultStart, defaultEnd } = getCurrentDefaults();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    workflow: ['all'],
    branch: ['all'],
    actor: ['all'],
    start: defaultStart,
    end: defaultEnd
  });

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
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    branchComparison = [],
    workflows = [],
    branches = [],
    actors = []
  } = data;

  const totalStatus = statusBreakdown.reduce((sum, s) => sum + (s.value || 0), 0);
  const statusData = statusBreakdown.map(s => ({
    ...s,
    percent: totalStatus ? Math.round((s.value / totalStatus) * 100) : 0
  }));

  const branchData = branchComparison.map(b => ({
    ...b,
    displayBranch: b.workflow ? `${b.workflow}/${b.branch}` : b.branch
  }));

  return (
    <div className="dashboard dark">
      <div className="container">

        <h2 style={{ marginTop: 0 }}>GitHub Actions Dashboard</h2>

        {/* ⭐ BUTTON PLACED HERE ⭐ */}
        <button
          onClick={handleExtract}
          style={{
            backgroundColor: "#238636",
            color: "white",
            padding: "10px 20px",
            borderRadius: "6px",
            cursor: "pointer",
            marginBottom: "20px",
            border: "none",
            fontSize: "15px",
            fontWeight: "600"
          }}
        >
          🔄 Extract Data (Sync)
        </button>

        {/* === FILTER PANEL === */}
        <div className="filter-panel card">
          <div className="filter-row">
            {/* WORKFLOW DROPDOWN */}
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

            {/* BRANCH DROPDOWN */}
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

            {/* ACTOR DROPDOWN */}
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

            {/* DATE PICKERS */}
            <div className="filter-group">
              <label>Period start</label>
              <input
                type="datetime-local"
                value={filters.start}
                onChange={(e) => handleFilterChange('start', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>Period end</label>
              <input
                type="datetime-local"
                value={filters.end}
                onChange={(e) => handleFilterChange('end', e.target.value)}
              />
            </div>

          </div>
        </div>

        {/* === CORE STATS === */}
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

        {/* === STATUS PIE === */}
        <div className="dashboard-grid">
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
                >
                  {statusData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* === BRANCH TABLE === */}
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
                    <tr key={`${b.workflow}-${b.branch}`}>
                      <td>{b.workflow}</td>
                      <td>{b.branch}</td>
                      <td>{b.totalRuns}</td>
                      <td>{b.successRate}%</td>
                      <td>{b.medianDuration}s</td>
                      <td>{b.failures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* === BRANCH BAR CHART === */}
          <div className="card card-span-2">
            <h3>Branch performance comparison</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={branchData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="displayBranch" angle={-15} textAnchor="end" height={70} />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="successRate" fill="#4caf50" />
                <Bar yAxisId="right" dataKey="medianDuration" fill="#2196f3" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* === RUNS OVER TIME === */}
          <div className="card">
            <h3>Daily runs breakdown</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={runsOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line dataKey="successes" stroke="#4caf50" strokeWidth={3} />
                <Line dataKey="failures" stroke="#f44336" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* === DURATION OVER TIME === */}
          <div className="card">
            <h3>Duration variability over time</h3>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={runsOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line dataKey="maxDuration" stroke="#ff9800" />
                <Line dataKey="minDuration" stroke="#4caf50" />
                <Line dataKey="medianDuration" stroke="#2196f3" strokeWidth={3} />
                <Line dataKey="avgDuration" stroke="#9c27b0" strokeWidth={2} strokeDasharray="5 5" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

        </div>
      </div>
    </div>
  );
}
