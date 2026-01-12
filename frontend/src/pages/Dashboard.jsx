import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

import StatCard from "../components/StatCard";
import { authFetch as authFetchFromApi } from "../services/api";

const COLORS = ["#6D5EF8", "#44C2A8", "#F4B04F", "#4F8EF7", "#E46C6C"];

/**
 * Récupère une "distribution par catégorie" depuis différents formats possibles.
 * But: éviter de casser le donut si le backend renvoie une autre clé.
 */
function extractDistribution(payload) {
  // formats possibles (au cas où)
  const candidates = [
    payload?.charts?.distribution,
    payload?.charts?.categories,
    payload?.distribution,
    payload?.category_distribution,
    payload?.categories,
  ];

  for (const c of candidates) {
    if (c && typeof c === "object" && !Array.isArray(c)) return c;
  }
  return {};
}

/**
 * Normalise le payload /dashboard/stats pour que l'UI soit stable.
 */
function normalizeStats(payload) {
  // Tes anciens formats
  const kpis = payload?.kpis || payload || {};
  const distribution = extractDistribution(payload);

  return {
    total_emails: Number(kpis?.total_emails || kpis?.emails || 0),
    high_urgency: Number(kpis?.high_urgency || kpis?.urgent || 0),
    invoices: Number(kpis?.invoices || kpis?.quittances || 0),

    distribution,

    // recents peut venir sous plusieurs noms
    recents: Array.isArray(payload?.recents)
      ? payload.recents
      : Array.isArray(payload?.recent_activity)
      ? payload.recent_activity
      : Array.isArray(payload?.activity)
      ? payload.activity
      : [],
  };
}

/**
 * Dashboard
 * - Appelle /dashboard/stats
 * - Affiche 3 KPI
 * - Affiche un donut (répartition catégories) si on a des données
 * - Affiche une liste "activité récente"
 *
 * Note: App.jsx passe parfois authFetch en prop, mais ton fichier importait authFetch directement.
 * Ici on supporte les deux: prop > fallback import.
 */
export default function Dashboard({ authFetch }) {
  const navigate = useNavigate();

  // On prend authFetch passé par AppShell si disponible, sinon celui du service
  const doFetch = authFetch || authFetchFromApi;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    total_emails: 0,
    high_urgency: 0,
    invoices: 0,
    distribution: {},
    recents: [],
  });

  // Transforme { "Autre": 3, "Urgent": 1 } -> [{name, value}]
  const donutData = useMemo(() => {
    const entries = Object.entries(stats.distribution || {});
    return entries
      .map(([name, value]) => ({ name, value: Number(value) || 0 }))
      .filter((x) => x.value > 0);
  }, [stats.distribution]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const res = await doFetch("/dashboard/stats");
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Stats HTTP ${res.status} ${txt}`);
        }

        const payload = await res.json().catch(() => ({}));

        // Debug utile si le donut reste vide (tu peux supprimer après)
        // console.debug("[dashboard payload]", payload);

        const normalized = normalizeStats(payload);
        if (!cancelled) setStats(normalized);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Erreur inconnue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [doFetch]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Tableau de Bord</h1>
      <p className="muted">Vue d’ensemble de l’activité de ton agence.</p>

      {error && (
        <div className="card" style={{ border: "1px solid rgba(255,0,0,0.25)" }}>
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {/* KPI (avec click restauré) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 18,
          marginTop: 14,
        }}
      >
        <StatCard
          title="EMAILS TRAITÉS"
          value={loading ? "…" : stats.total_emails}
          color="#6D5EF8"
          onClick={() => navigate("/emails/history")}
        />
        <StatCard
          title="URGENCE HAUTE"
          value={loading ? "…" : stats.high_urgency}
          color="#E46C6C"
          onClick={() => navigate("/emails/history")}
        />
        <StatCard
          title="QUITTANCES GÉNÉRÉES"
          value={loading ? "…" : stats.invoices}
          color="#44C2A8"
          onClick={() => navigate("/invoices")}
        />
      </div>

      {/* 2 colonnes */}
      <div className="dashboard-grid" style={{ marginTop: 18 }}>
        {/* Donut */}
        <div className="card">
          <div style={{ fontWeight: 900, marginBottom: 10 }}>📊 Répartition par Catégorie</div>

          {donutData.length === 0 ? (
            <div className="muted">
              Aucune donnée de catégorie pour l’instant.
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                (Si tu sais qu’il y a des données, c’est juste une différence de format côté backend :
                on peut l’ajuster en 30 secondes.)
              </div>
            </div>
          ) : (
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={2}
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
        </div>

        {/* Activité */}
        <div className="card">
          <div style={{ fontWeight: 900, marginBottom: 10 }}>⚡ Activité Récente</div>

          {loading ? (
            <div className="muted">Chargement…</div>
          ) : stats.recents.length === 0 ? (
            <div className="muted">Aucune activité pour l’instant.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stats.recents.slice(0, 5).map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.18)",
                    cursor: "pointer",
                  }}
                  onClick={() => navigate("/emails/history")}
                  title="Voir dans l’historique"
                >
                  <div style={{ fontWeight: 800 }}>{r.subject || "Email"}</div>
                  <div className="muted" style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <span>{r.category || "Autre"}</span>
                    <span>•</span>
                    <span>{r.date || ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => navigate("/emails/history")}>
              Voir tout l’historique
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
