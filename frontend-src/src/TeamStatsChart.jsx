import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const TEAMS = [
  "ANA","ARI","BOS","BUF","CGY","CAR","CHI","COL","CBJ","DAL","DET","EDM",
  "FLA","LAK","MIN","MTL","NSH","NJD","NYI","NYR","OTT","PHI","PIT","SJS",
  "STL","TBL","TOR","UTA","VAN","WSH","WPG","VGK","SEA",
];

const SEASONS = ["20252026", "20242025", "20232024"];

const METRICS = [
  { key: "shotsFor", label: "Shots For" },
  { key: "shotsAgainst", label: "Shots Against" },
  { key: "goalsFor", label: "Goals For" },
  { key: "goalsAgainst", label: "Goals Against" },
];

const VIEWS = [
  { key: "perGame", label: "Game Level" },
  { key: "rolling5", label: "5-Game Avg" },
  { key: "rolling10", label: "10-Game Avg" },
];

function getInitialState() {
  const params = new URLSearchParams(window.location.search);
  return {
    team: params.get("team") || "CHI",
    season: params.get("season") || SEASONS[0],
    view: params.get("view") || "rolling5",
    metric: params.get("metric") || "goalsFor",
  };
}

function syncUrl(state) {
  const params = new URLSearchParams(state);
  window.history.replaceState(null, "", `?${params.toString()}`);
}

export default function TeamStatsChart() {
  const [state, setState] = useState(getInitialState);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    syncUrl(state);
    setStatus("loading");
    fetch(`/api/team-stats?team=${state.team}&season=${state.season}`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(json => {
        setData(json);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [state.team, state.season]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data[state.view] || [];
  }, [data, state.view]);

  const update = (key, value) => setState(s => ({ ...s, [key]: value }));

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>{state.team} — Team Trends</h1>
        <span style={styles.subtitle}>
          {data?.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleString()}` : ""}
        </span>
      </header>

      <div style={styles.controls}>
        <Select label="Team" value={state.team} options={TEAMS} onChange={v => update("team", v)} />
        <Select label="Season" value={state.season} options={SEASONS} onChange={v => update("season", v)} />
        <Select
          label="View"
          value={state.view}
          options={VIEWS.map(v => v.key)}
          labels={VIEWS}
          onChange={v => update("view", v)}
        />
        <Select
          label="Metric"
          value={state.metric}
          options={METRICS.map(m => m.key)}
          labels={METRICS}
          onChange={v => update("metric", v)}
        />
      </div>

      <div style={styles.chartFrame}>
        {status === "loading" && <Centered>Loading…</Centered>}
        {status === "error" && <Centered>Couldn't load data for this team/season.</Centered>}
        {status === "ready" && chartData.length === 0 && <Centered>No games yet for this season.</Centered>}
        {status === "ready" && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={chartData} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey={state.metric}
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
                name={METRICS.find(m => m.key === state.metric)?.label}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Select({ label, value, options, labels, onChange }) {
  return (
    <label style={styles.selectLabel}>
      <span style={styles.selectCaption}>{label}</span>
      <select style={styles.select} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(opt => (
          <option key={opt} value={opt}>
            {labels ? labels.find(l => l.key === opt)?.label : opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function Centered({ children }) {
  return <div style={styles.centered}>{children}</div>;
}

const styles = {
  page: {
    background: "#0b0f14",
    color: "#e5e7eb",
    minHeight: "100vh",
    padding: "24px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" },
  subtitle: { fontSize: 12, color: "#6b7280" },
  controls: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 },
  selectLabel: { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#9ca3af" },
  selectCaption: { textTransform: "uppercase", letterSpacing: "0.05em" },
  select: {
    background: "#111827",
    color: "#e5e7eb",
    border: "1px solid #374151",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
  },
  chartFrame: {
    background: "#0f1520",
    border: "1px solid #1f2937",
    borderRadius: 12,
    padding: 16,
  },
  centered: {
    height: 420,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    fontSize: 14,
  },
};
