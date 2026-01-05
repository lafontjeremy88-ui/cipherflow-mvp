import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "../App";

function pickArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.emails)) return data.emails;
  if (Array.isArray(data?.history)) return data.history;
  return [];
}

function formatDateFR(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Dashboard() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);

      try {
        const [sRes, hRes] = await Promise.all([
          authFetch("/dashboard/stats"),
          authFetch("/email/history"),
        ]);

        const s = sRes.ok ? await sRes.json() : null;
        const h = hRes.ok ? await hRes.json() : null;

        if (!alive) return;

        setStats(s);
        setHistory(pickArray(h));
      } catch (e) {
        if (!alive) return;
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
  }, [authFetch]);

  const kpis = useMemo(() => {
    const emailsTraites = Number(stats?.emails_traités ?? stats?.emailsTraites ?? stats?.emails_processed ?? stats?.emails_processed_count ?? stats?.emails_count ?? 0);
    const urgenceHaute = Number(stats?.urgence_haute ?? stats?.urgent_count ?? stats?.urgences ?? 0);
    const quittances = Number(stats?.quittances_generees ?? stats?.invoices_count ?? 0);

    return { emailsTraites, urgenceHaute, quittances };
  }, [stats]);

  const recent = useMemo(() => {
    // on prend les 6 derniers par date si dispo
    const copy = [...history];
    copy.sort((a, b) => {
      const da = new Date(a?.created_at || a?.date || a?.received_at || 0).getTime();
      const db = new Date(b?.created_at || b?.date || b?.received_at || 0).getTime();
      return db - da;
    });
    return copy.slice(0, 6);
  }, [history]);

  const repartition = useMemo(() => {
    const map = new Map();
    for (const e of history) {
      const cat = (e?.category || e?.type || e?.label || "Autre")?.toString();
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    const total = history.length || 1;
    const arr = [...map.entries()].map(([name, value]) => ({
      name,
      value,
      pct: Math.round((value / total) * 100),
    }));
    // si vide => 0
    return arr.length ? arr : [{ name: "Aucune donnée", value: 1, pct: 0 }];
  }, [history]);

  function goHistory(filter) {
    // tu peux enrichir plus tard : /history?filter=urgent etc.
    navigate(`/history${filter ? `?filter=${encodeURIComponent(filter)}` : ""}`);
  }

  function goEmail(emailId) {
    if (!emailId) return;
    navigate(`/history?emailId=${encodeURIComponent(emailId)}`);
  }

  const COLORS = ["#5b5be0", "#49c6a8", "#f3b24e", "#e85c9a", "#7ad1ff", "#a3e635"];

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 44, letterSpacing: 0.2 }}>Vue d&apos;ensemble</h1>
        <h2 style={{ margin: "8px 0 6px", fontSize: 30, opacity: 0.95 }}>Tableau de Bord</h2>
        <div style={{ opacity: 0.8 }}>Vue d’ensemble de l’activité de ton agence.</div>
      </div>

      {/* KPI */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 18,
          marginTop: 16,
        }}
      >
        <button
          onClick={() => goHistory("")}
          className="card"
          style={{ textAlign: "left", cursor: "pointer", borderLeft: "4px solid #5b5be0" }}
        >
          <div style={{ opacity: 0.75, fontWeight: 700 }}>EMAILS TRAITÉS</div>
          <div style={{ fontSize: 34, fontWeight: 800, marginTop: 6 }}>{loading ? "…" : kpis.emailsTraites}</div>
        </button>

        <button
          onClick={() => goHistory("urgent")}
          className="card"
          style={{ textAlign: "left", cursor: "pointer", borderLeft: "4px solid #f3b24e" }}
        >
          <div style={{ opacity: 0.75, fontWeight: 700 }}>URGENCE HAUTE</div>
          <div style={{ fontSize: 34, fontWeight: 800, marginTop: 6 }}>{loading ? "…" : kpis.urgenceHaute}</div>
        </button>

        <button
          onClick={() => goHistory("invoices")}
          className="card"
          style={{ textAlign: "left", cursor: "pointer", borderLeft: "4px solid #49c6a8" }}
        >
          <div style={{ opacity: 0.75, fontWeight: 700 }}>QUITTANCES GÉNÉRÉES</div>
          <div style={{ fontSize: 34, fontWeight: 800, marginTop: 6 }}>{loading ? "…" : kpis.quittances}</div>
        </button>
      </div>

      {/* Donut + Activité */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18 }}>
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 10 }}>📊 Répartition par Catégorie</div>

          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={repartition}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="85%"
                  paddingAngle={2}
                  labelLine={false}
                  label={(entry) => (entry?.pct ? `${entry.pct}%` : "")}
                >
                  {repartition.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, opacity: 0.9 }}>
            {repartition.map((c, idx) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: COLORS[idx % COLORS.length], display: "inline-block" }} />
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 10 }}>⚡ Activité Récente</div>

          {recent.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Aucune activité pour l’instant.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {recent.map((e) => {
                const id = e?.id || e?._id || e?.email_id || e?.emailId;
                const subject = e?.subject || e?.title || "(Sans sujet)";
                const cat = e?.category || e?.type || "Autre";
                const dt = formatDateFR(e?.created_at || e?.date || e?.received_at);

                return (
                  <button
                    key={id || subject + dt}
                    onClick={() => goEmail(id)}
                    className="card"
                    style={{
                      cursor: "pointer",
                      textAlign: "left",
                      padding: 14,
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {subject}
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 13 }}>
                      {cat} • {dt}
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
