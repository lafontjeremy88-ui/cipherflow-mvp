import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

function safeJsonParse(res) {
  return res.json().catch(() => ({}));
}

function toArrayHistory(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.emails)) return payload.emails;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeStats(payload) {
  // On accepte plusieurs formats côté backend sans casser le front
  const emailsProcessed =
    payload?.emails_processed ??
    payload?.emailsProcessed ??
    payload?.emails ??
    payload?.processed ??
    0;

  const highUrgency =
    payload?.high_urgency ??
    payload?.highUrgency ??
    payload?.urgent ??
    0;

  const receiptsGenerated =
    payload?.receipts_generated ??
    payload?.receiptsGenerated ??
    payload?.receipts ??
    0;

  const categories =
    payload?.categories ??
    payload?.category_counts ??
    payload?.categoryCounts ??
    payload?.by_category ??
    {};

  return {
    emailsProcessed: Number(emailsProcessed) || 0,
    highUrgency: Number(highUrgency) || 0,
    receiptsGenerated: Number(receiptsGenerated) || 0,
    categories: categories && typeof categories === "object" ? categories : {},
  };
}

export default function Dashboard({ authFetch }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    emailsProcessed: 0,
    highUrgency: 0,
    receiptsGenerated: 0,
    categories: {},
  });
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");

  const donutData = useMemo(() => {
    const entries = Object.entries(stats.categories || {});
    const cleaned = entries
      .map(([name, value]) => ({
        name,
        value: Number(value) || 0,
      }))
      .filter((x) => x.value > 0);

    // fallback (si backend n'envoie pas categories mais qu'on a des mails)
    return cleaned;
  }, [stats.categories]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        // 1) stats
        const resStats = await authFetch("/dashboard/stats");
        if (!resStats.ok) {
          const txt = await resStats.text().catch(() => "");
          throw new Error(`Stats HTTP ${resStats.status} ${txt}`);
        }
        const statsPayload = await safeJsonParse(resStats);
        const normalized = normalizeStats(statsPayload);

        // 2) recent activity (limit 5)
        const resRecent = await authFetch("/email/history?limit=5");
        if (!resRecent.ok) {
          const txt = await resRecent.text().catch(() => "");
          throw new Error(`History HTTP ${resRecent.status} ${txt}`);
        }
        const recentPayload = await safeJsonParse(resRecent);
        const items = toArrayHistory(recentPayload);

        if (!cancelled) {
          setStats(normalized);
          setRecent(items.slice(0, 5));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Erreur inconnue");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  const goHistory = () => navigate("/emails");

  const goHistoryEmail = (emailId) => {
    if (!emailId) return navigate("/emails");
    navigate(`/emails?emailId=${encodeURIComponent(emailId)}`);
  };

  // couleurs “fixes” (pas obligatoires, mais c’est mieux pour garder le même style)
  const COLORS = ["#6D5EF8", "#44C2A8", "#F4B04F", "#4F8EF7", "#E46C6C"];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Vue d'ensemble</h1>
        <h2>Tableau de Bord</h2>
        <p>Vue d'ensemble de l'activité de ton agence.</p>
      </div>

      {error && (
        <div className="alert error">
          <strong>Erreur:</strong> {error}
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card clickable" onClick={goHistory} role="button" tabIndex={0}>
          <div className="stat-title">EMAILS TRAITÉS</div>
          <div className="stat-value">{loading ? "…" : stats.emailsProcessed}</div>
        </div>

        <div className="stat-card clickable" onClick={goHistory} role="button" tabIndex={0}>
          <div className="stat-title">URGENCE HAUTE</div>
          <div className="stat-value">{loading ? "…" : stats.highUrgency}</div>
        </div>

        <div className="stat-card clickable" onClick={() => navigate("/receipts")} role="button" tabIndex={0}>
          <div className="stat-title">QUITTANCES GÉNÉRÉES</div>
          <div className="stat-value">{loading ? "…" : stats.receiptsGenerated}</div>
        </div>
      </div>

      <div className="grid-2">
        {/* DONUT */}
        <div className="card">
          <div className="card-title">📊 Répartition par Catégorie</div>

          {donutData.length === 0 ? (
            <div className="muted">Aucune donnée de catégorie pour l’instant.</div>
          ) : (
            <div style={{ width: "100%", height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
                    labelLine={false}
                    label={({ percent }) => `${Math.round(percent * 100)}%`}
                  >
                    {donutData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {donutData.length > 0 && (
            <div className="legend">
              {donutData.map((d, idx) => (
                <div key={d.name} className="legend-item">
                  <span
                    className="dot"
                    style={{ background: COLORS[idx % COLORS.length] }}
                  />
                  <span className="legend-label">{d.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RECENT */}
        <div className="card">
          <div className="card-title">⚡ Activité Récente</div>

          {recent.length === 0 ? (
            <div className="muted">Aucune activité pour l’instant.</div>
          ) : (
            <div className="recent-list">
              {recent.map((m) => {
                const id = m.id || m.email_id || m.emailId;
                const subject = m.subject || m.title || "(Sans sujet)";
                const category = m.category || "Autre";
                const date =
                  m.created_at || m.date || m.received_at || m.receivedAt || "";

                return (
                  <div
                    key={id || subject + date}
                    className="recent-item clickable"
                    onClick={() => goHistoryEmail(id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="recent-subject">{subject}</div>
                    <div className="recent-meta">
                      <span className="recent-cat">{category}</span>
                      {date ? <span className="recent-date"> • {String(date).slice(0, 16)}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={goHistory}>
              Voir tout l’historique
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
