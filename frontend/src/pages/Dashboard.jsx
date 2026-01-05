// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

import StatCard from "../components/StatCard";
import { authFetch } from "../services/api";

// Couleurs (doivent matcher ton thème)
const PIE_COLORS = ["#5B5CEB", "#34D399", "#FBBF24", "#FB7185", "#60A5FA"];

function safeArray(x) {
  if (Array.isArray(x)) return x;
  if (!x) return [];
  if (Array.isArray(x.items)) return x.items;
  if (Array.isArray(x.data)) return x.data;
  return [];
}

function safeObj(x) {
  return x && typeof x === "object" ? x : {};
}

// Label % au milieu de chaque slice (si la slice est trop petite, on évite d’afficher)
function renderPercentLabel(props) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  if (!percent || percent < 0.06) return null; // < 6% -> pas lisible, on masque

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.65;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="rgba(255,255,255,0.85)"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 12, fontWeight: 700 }}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    emails_processed: 0,
    urgent_high: 0,
    invoices_generated: 0,
    categories: {}, // { Administratif: 4, Autre: 2, ... }
  });
  const [recent, setRecent] = useState([]); // emails récents (activité)

  const fetchAll = async () => {
    try {
      setLoading(true);

      // 1) Stats
      const s = await authFetch("/dashboard/stats");
      const sObj = safeObj(s);

      // Harmonisation de clés (au cas où ton backend renvoie d’autres noms)
      const emailsProcessed =
        sObj.emails_processed ?? sObj.emailsProcessed ?? sObj.processed ?? 0;
      const urgentHigh = sObj.urgent_high ?? sObj.urgentHigh ?? sObj.urgent ?? 0;
      const invoicesGenerated =
        sObj.invoices_generated ?? sObj.invoicesGenerated ?? sObj.invoices ?? 0;

      const categories = safeObj(sObj.categories ?? sObj.by_category ?? sObj.category_counts);

      setStats({
        emails_processed: Number(emailsProcessed) || 0,
        urgent_high: Number(urgentHigh) || 0,
        invoices_generated: Number(invoicesGenerated) || 0,
        categories,
      });

      // 2) Activité récente : on prend l’historique email et on garde les 6 derniers
      const h = await authFetch("/email/history");
      const list = safeArray(h);

      // tri décroissant par date (si dispo)
      const sorted = [...list].sort((a, b) => {
        const da = new Date(a.created_at || a.date || a.received_at || 0).getTime();
        const db = new Date(b.created_at || b.date || b.received_at || 0).getTime();
        return db - da;
      });

      setRecent(sorted.slice(0, 6));
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // rafraîchit léger toutes les 30s
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Données du donut
  const donutData = useMemo(() => {
    const entries = Object.entries(stats.categories || {});
    if (!entries.length) return [];

    const total = entries.reduce((acc, [, v]) => acc + (Number(v) || 0), 0);
    if (!total) return [];

    return entries
      .map(([name, value]) => ({ name, value: Number(value) || 0 }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [stats.categories]);

  // --- NAVIGATION ---
  // Stat cards → historique (tu peux aussi envoyer un filtre)
  const goHistory = (filterKey) => {
    // Exemple: /history?filter=urgent
    if (filterKey) {
      navigate(`/history?filter=${encodeURIComponent(filterKey)}`);
      return;
    }
    navigate("/history");
  };

  // Activité récente → historique ciblé sur un email
  const openEmailFromActivity = (email) => {
    const id = email?.id ?? email?.email_id ?? email?.message_id;
    if (!id) {
      navigate("/history");
      return;
    }
    navigate(`/history?emailId=${encodeURIComponent(id)}`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Vue d&apos;ensemble</h1>
        <h2>Tableau de Bord</h2>
        <p className="muted">Vue d’ensemble de l’activité de ton agence.</p>
      </div>

      {/* KPIs */}
      <div className="stats-row">
        <div onClick={() => goHistory()} style={{ cursor: "pointer" }}>
          <StatCard
            title="Emails traités"
            value={loading ? "…" : stats.emails_processed}
            tone="primary"
          />
        </div>

        <div onClick={() => goHistory("urgent")} style={{ cursor: "pointer" }}>
          <StatCard
            title="Urgence haute"
            value={loading ? "…" : stats.urgent_high}
            tone="warning"
          />
        </div>

        <div onClick={() => goHistory("invoices")} style={{ cursor: "pointer" }}>
          <StatCard
            title="Quittances générées"
            value={loading ? "…" : stats.invoices_generated}
            tone="success"
          />
        </div>
      </div>

      {/* Bloc bas : Donut + Activité */}
      <div className="dashboard-grid">
        {/* Donut */}
        <div className="card card-large">
          <div className="card-title">📊 Répartition par Catégorie</div>

          {donutData.length === 0 ? (
            <div className="empty">Aucune donnée de catégorie pour l’instant.</div>
          ) : (
            <div
              className="chart-wrap"
              style={{
                width: "100%",
                height: 320, // IMPORTANT: évite width/height = -1
                minHeight: 320,
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={78}
                    outerRadius={120}
                    paddingAngle={2}
                    labelLine={false}
                    label={renderPercentLabel}
                  >
                    {donutData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>

                  <Tooltip
                    formatter={(value, name) => [value, name]}
                    contentStyle={{
                      background: "rgba(15,20,40,0.95)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={24}
                    wrapperStyle={{ color: "rgba(255,255,255,0.75)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Activité récente */}
        <div className="card card-large">
          <div className="card-title">⚡ Activité Récente</div>

          {loading ? (
            <div className="empty">Chargement…</div>
          ) : recent.length === 0 ? (
            <div className="empty">Aucune activité pour l’instant.</div>
          ) : (
            <div className="activity-list">
              {recent.map((e) => {
                const id = e?.id ?? e?.email_id ?? e?.message_id;
                const subject = e?.subject ?? e?.objet ?? "(Sans sujet)";
                const category = e?.category ?? e?.categorie ?? "Autre";
                const dateRaw = e?.created_at || e?.date || e?.received_at;
                const date = dateRaw ? new Date(dateRaw) : null;

                const dateLabel = date
                  ? `${String(date.getDate()).padStart(2, "0")}/${String(
                      date.getMonth() + 1
                    ).padStart(2, "0")}/${String(date.getFullYear()).slice(2)} ${String(
                      date.getHours()
                    ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
                  : "";

                return (
                  <button
                    key={id || subject}
                    className="activity-item"
                    onClick={() => openEmailFromActivity(e)}
                    type="button"
                  >
                    <div className="activity-subject">{subject}</div>
                    <div className="activity-meta">
                      {category} {dateLabel ? `• ${dateLabel}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
