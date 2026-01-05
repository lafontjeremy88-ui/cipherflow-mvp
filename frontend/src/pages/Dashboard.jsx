import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import {
  Mail,
  AlertTriangle,
  FileText,
  Activity,
  PieChart as PieIcon,
} from "lucide-react";

import StatCard from "../components/StatCard";
import { authFetch } from "../services/api";

function formatDateFR(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
}

function normalizeCategory(cat) {
  if (!cat) return "Autre";
  const c = String(cat).trim();
  if (!c) return "Autre";
  return c;
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Fetch stats + history
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const [statsRes, histRes] = await Promise.all([
          authFetch("/dashboard/stats"),
          authFetch("/email/history"),
        ]);

        if (!alive) return;

        const s = await statsRes.json();
        const h = await histRes.json();

        setStats(s);
        setHistory(Array.isArray(h) ? h : []);
      } catch (e) {
        console.error("Dashboard load error:", e);
        setStats(null);
        setHistory([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // --- KPIs (avec fallback si stats null)
  const emailsTraites = stats?.emails_processed ?? stats?.emails_treated ?? 0;
  const urgenceHaute = stats?.urgent_count ?? stats?.urgences_hautes ?? 0;
  const quittancesGen = stats?.invoices_generated ?? stats?.quittances_generees ?? 0;

  // --- Donut data : basé sur history
  const donutData = useMemo(() => {
    const map = new Map();
    for (const email of history) {
      const cat = normalizeCategory(email.category);
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    // si vide -> placeholder
    if (map.size === 0) {
      return [{ name: "Aucun", value: 1 }];
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [history]);

  // --- Couleurs (pas besoin d’être parfait, juste stable)
  const pieColors = ["#6366F1", "#34D399", "#FBBF24", "#60A5FA", "#F87171", "#A78BFA"];

  // --- Activité récente : 5 derniers emails (par created_at)
  const recentActivity = useMemo(() => {
    const sorted = [...history].sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });
    return sorted.slice(0, 6);
  }, [history]);

  // --- Navigation “intelligente”
  function goHistory(filter = {}) {
    // filter = { category, urgency, q } etc.
    const params = new URLSearchParams();
    if (filter.category) params.set("category", filter.category);
    if (filter.urgency) params.set("urgency", filter.urgency);
    if (filter.q) params.set("q", filter.q);

    const qs = params.toString();
    navigate(qs ? `/history?${qs}` : "/history");
  }

  function openEmailInHistory(emailId) {
    // on ouvre /history avec emailId pour que la page sélectionne le mail
    navigate(`/history?emailId=${encodeURIComponent(emailId)}`);
  }

  // --- Pie labels en %
  const renderPercentLabel = (props) => {
    const { percent, x, y } = props;
    if (!percent || percent <= 0.02) return null; // évite les minis labels
    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 12, fontWeight: 700 }}
      >
        {`${Math.round(percent * 100)}%`}
      </text>
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Vue d&apos;ensemble</h1>
        <h2>Tableau de Bord</h2>
        <p className="muted">Vue d&apos;ensemble de l&apos;activité de ton agence.</p>
      </div>

      {/* --- KPI Cards */}
      <div className="stats-grid">
        <StatCard
          icon={<Mail size={20} />}
          label="Emails Traités"
          value={loading ? "…" : emailsTraites}
          accent="purple"
          onClick={() => goHistory()}
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="Urgence Haute"
          value={loading ? "…" : urgenceHaute}
          accent="orange"
          onClick={() => goHistory({ urgency: "high" })}
        />
        <StatCard
          icon={<FileText size={20} />}
          label="Quittances Générées"
          value={loading ? "…" : quittancesGen}
          accent="green"
          onClick={() => navigate("/invoices")}
        />
      </div>

      {/* --- Donut + Activity */}
      <div className="dashboard-grid">
        {/* Donut */}
        <div className="card">
          <div className="card-title">
            <span className="card-title-icon">
              <PieIcon size={18} />
            </span>
            <span>Répartition par Catégorie</span>
          </div>

          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={85}
                  outerRadius={120}
                  paddingAngle={2}
                  labelLine={false}
                  label={renderPercentLabel}
                  isAnimationActive={false}
                >
                  {donutData.map((entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={pieColors[idx % pieColors.length]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity */}
        <div className="card">
          <div className="card-title">
            <span className="card-title-icon">
              <Activity size={18} />
            </span>
            <span>Activité Récente</span>
          </div>

          <div className="activity-list">
            {recentActivity.length === 0 ? (
              <div className="muted" style={{ padding: 12 }}>
                Aucun email pour l’instant.
              </div>
            ) : (
              recentActivity.map((email) => (
                <button
                  key={email.id}
                  className="activity-item"
                  onClick={() => openEmailInHistory(email.id)}
                >
                  <div className="activity-subject">
                    {email.subject || "(Sans sujet)"}
                  </div>
                  <div className="activity-meta">
                    {normalizeCategory(email.category)} • {formatDateFR(email.created_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
