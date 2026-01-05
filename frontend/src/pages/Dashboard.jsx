import React, { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

import { authFetch, getDashboardStats } from "../services/api";
import StatCard from "../components/StatCard";

// Helpers
function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function fmtDateTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeCategory(cat) {
  if (!cat) return "Autre";
  const c = String(cat).trim();
  return c ? c : "Autre";
}

const DONUT_COLORS = ["#5B5FEF", "#49C17A", "#F4A340", "#9B59B6", "#2DB4D6"];

export default function Dashboard({ onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    emails_processed: 0,
    high_urgency: 0,
    invoices_generated: 0,
  });
  const [history, setHistory] = useState([]); // emails history

  const donutData = useMemo(() => {
    const counts = new Map();
    for (const e of history) {
      const cat = normalizeCategory(e?.category);
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;

    return Array.from(counts.entries())
      .map(([name, value]) => ({
        name,
        value,
        pct: Math.round((value / total) * 100),
      }))
      .sort((a, b) => b.value - a.value);
  }, [history]);

  const recentActivity = useMemo(() => {
    const arr = [...history];
    arr.sort((a, b) => {
      const ta =
        new Date(a?.analyzed_at || a?.created_at || a?.received_at || 0).getTime() || 0;
      const tb =
        new Date(b?.analyzed_at || b?.created_at || b?.received_at || 0).getTime() || 0;
      return tb - ta;
    });
    return arr.slice(0, 6);
  }, [history]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // KPIs
        try {
          const stats = await getDashboardStats();
          if (!cancelled && stats && typeof stats === "object") {
            setKpis({
              emails_processed: safeNumber(
                stats.emails_processed ??
                  stats.emails_processed_count ??
                  stats.emails ??
                  stats.count_emails,
                0
              ),
              high_urgency: safeNumber(
                stats.high_urgency ?? stats.urgent_high ?? stats.urgency_high ?? stats.urgent,
                0
              ),
              invoices_generated: safeNumber(
                stats.invoices_generated ??
                  stats.quittances_generated ??
                  stats.invoices ??
                  stats.quittances,
                0
              ),
            });
          }
        } catch {
          // ignore
        }

        // History
        const res = await authFetch("/email/history");
        const data = await res.json();
        if (!cancelled) {
          const arr = Array.isArray(data) ? data : [];
          setHistory(arr);

          // fallback KPI
          setKpis((prev) => {
            const emailsCount = arr.length;
            const urgentCount = arr.reduce((acc, e) => {
              const u = String(e?.urgency || "").toLowerCase();
              if (u === "high" || u === "haute" || u === "urgent" || u === "3") return acc + 1;
              return acc;
            }, 0);

            return {
              emails_processed: prev.emails_processed > 0 ? prev.emails_processed : emailsCount,
              high_urgency: prev.high_urgency > 0 ? prev.high_urgency : urgentCount,
              invoices_generated: safeNumber(prev.invoices_generated, 0),
            };
          });
        }
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Click actions
  const goHistory = () => {
    if (typeof onNavigate === "function") onNavigate("history");
  };
  const goHistoryWithEmail = (emailId) => {
    if (typeof onNavigate === "function") onNavigate("history", emailId);
    else window.location.href = "/history";
  };

  // Donut label (%)
  const renderPctLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, payload }) => {
    const p = payload?.pct ?? Math.round((percent || 0) * 100);
    if (!p || p < 6) return null; // évite d’encombrer pour les petites parts

    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontWeight: 800, fontSize: 12, opacity: 0.95 }}
      >
        {p}%
      </text>
    );
  };

  const wrapStyle = { display: "flex", flexDirection: "column", gap: 18 };
  const statsRowStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
    gap: 18,
  };
  const bottomGridStyle = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
    alignItems: "stretch",
  };
  const cardTitleStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 800,
    fontSize: 16,
    marginBottom: 10,
  };
  const emptyStyle = { opacity: 0.75, padding: "18px 0" };

  return (
    <div className="page">
      <div style={wrapStyle}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Vue d&apos;ensemble</h1>
            <h2 className="page-subtitle" style={{ marginTop: 6 }}>
              Tableau de Bord
            </h2>
            <p className="page-description">Vue d&apos;ensemble de l&apos;activité de ton agence.</p>
          </div>
        </div>

        {/* KPIs (cliquables -> Historique) */}
        <div style={statsRowStyle}>
          <div style={{ cursor: "pointer" }} onClick={goHistory} title="Voir l'historique">
            <StatCard
              title="Emails Traités"
              value={loading ? "…" : kpis.emails_processed}
              icon="mail"
              accent="purple"
            />
          </div>

          <div style={{ cursor: "pointer" }} onClick={goHistory} title="Voir l'historique">
            <StatCard
              title="Urgence Haute"
              value={loading ? "…" : kpis.high_urgency}
              icon="alert"
              accent="orange"
            />
          </div>

          <div style={{ cursor: "pointer" }} onClick={goHistory} title="Voir l'historique">
            <StatCard
              title="Quittances Générées"
              value={loading ? "…" : kpis.invoices_generated}
              icon="invoice"
              accent="green"
            />
          </div>
        </div>

        {/* Donut + Activité */}
        <div style={bottomGridStyle}>
          <div className="card">
            <div style={cardTitleStyle}>📊 Répartition par Catégorie</div>

            {donutData.length === 0 ? (
              <div style={emptyStyle}>Aucune donnée pour l’instant.</div>
            ) : (
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={105}
                      paddingAngle={3}
                      stroke="rgba(255,255,255,0.10)"
                      label={renderPctLabel}
                      labelLine={false}
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={`cell-${entry.name}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                      ))}
                    </Pie>

                    <Tooltip
                      formatter={(val, name, props) => {
                        const pct = props?.payload?.pct ?? "";
                        return [`${val} (${pct}%)`, name];
                      }}
                    />

                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card">
            <div style={cardTitleStyle}>⚡ Activité Récente</div>

            {recentActivity.length === 0 ? (
              <div style={emptyStyle}>Aucune activité récente.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recentActivity.map((e) => {
                  const when = fmtDateTime(e?.analyzed_at || e?.created_at || e?.received_at);
                  const emailId = e?.id ?? e?.email_id ?? null;

                  return (
                    <div
                      key={emailId ?? `${e?.subject}-${when}`}
                      onClick={() => emailId && goHistoryWithEmail(emailId)}
                      title={emailId ? "Ouvrir cet email dans l'historique" : ""}
                      style={{
                        cursor: emailId ? "pointer" : "default",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(0,0,0,0.12)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{e?.subject || "(Sans sujet)"}</div>
                      <div style={{ opacity: 0.85, fontSize: 12 }}>
                        {normalizeCategory(e?.category)}
                        {when ? ` • ${when}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
