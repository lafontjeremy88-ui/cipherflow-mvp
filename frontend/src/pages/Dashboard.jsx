import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Mail, AlertTriangle, FileText } from "lucide-react";

import StatCard from "../components/StatCard";
import { authFetch as authFetchFromApi } from "../services/api";

// Palette de base (fallback)
const FALLBACK_COLORS = ["#6D5EF8", "#44C2A8", "#F4B04F", "#4F8EF7", "#E46C6C"];

// Couleurs standardisées par catégorie
const CATEGORY_COLORS = {
  Autre: "#6D5EF8",          // violet (couleur de marque)
  Administratif: "#44C2A8",  // vert/teal
  Candidature: "#F4B04F",    // jaune/amber
  Incident: "#E46C6C",       // rouge
};

// Helper : choisir la bonne couleur pour une catégorie
function getCategoryColor(name, idx) {
  if (name && CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}


function extractDistribution(payload) {
  const candidates = [
    payload?.charts?.distribution,
    payload?.charts?.categories,
    payload?.distribution,
    payload?.category_distribution,
    payload?.categories,
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (Array.isArray(c)) return c;
    if (typeof c === "object") return c;
  }
  return [];
}

function normalizeStats(payload) {
  const kpis = payload?.kpis || payload || {};
  const distribution = extractDistribution(payload);

  return {
    total_emails: Number(kpis?.total_emails || kpis?.emails || 0),
    high_urgency: Number(kpis?.high_urgency || kpis?.urgent || 0),

    tenant_files: Number(
      kpis?.tenant_files || kpis?.tenantfiles || kpis?.dossiers ||
      kpis?.invoices || kpis?.quittances || 0
    ),
    tenant_files_incomplete: Number(kpis?.tenant_files_incomplete || 0),

    distribution,
    recents: Array.isArray(payload?.recents)
      ? payload.recents
      : Array.isArray(payload?.recent_activity)
      ? payload.recent_activity
      : Array.isArray(payload?.activity)
      ? payload.activity
      : [],
  };
}


function truncate(s, n = 70) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtPct(x) {
  if (!Number.isFinite(x)) return "0%";
  return `${Math.round(x)}%`;
}

function buildDonut(dist) {
  // dist peut être array [{name,value}] ou objet {name:value}
  let arr = [];

  if (Array.isArray(dist)) {
    arr = dist
      .map((d) => ({ name: String(d?.name || ""), value: Number(d?.value) || 0 }))
      .filter((d) => d.name && d.value > 0);
  } else if (dist && typeof dist === "object") {
    arr = Object.entries(dist)
      .map(([name, value]) => ({ name, value: Number(value) || 0 }))
      .filter((d) => d.name && d.value > 0);
  }

  // tri décroissant + calc %
  const total = arr.reduce((s, x) => s + x.value, 0) || 1;
  arr.sort((a, b) => b.value - a.value);

  const withPct = arr.map((x) => ({
    ...x,
    pct: (x.value / total) * 100,
  }));

  return { total, data: withPct };
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{p.name}</div>
      <div className="chart-tooltip-line">
        <span className="muted">Emails :</span> <strong>{p.value}</strong>
      </div>
      <div className="chart-tooltip-line">
        <span className="muted">Part :</span> <strong>{fmtPct(p.pct)}</strong>
      </div>
    </div>
  );
}

export default function Dashboard({ authFetch }) {
  const navigate = useNavigate();

const goToCategory = (name) => {
  if (!name) return;
  navigate(`/emails/history?category=${encodeURIComponent(name)}`);
};
  const doFetch = authFetch || authFetchFromApi;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    total_emails: 0,
    high_urgency: 0,
    tenant_files: 0,
    tenant_files_incomplete: 0,
    distribution: [],
    recents: [],
  });
  const [gmailConnected, setGmailConnected] = useState(null); // null = inconnu

  const donut = useMemo(() => buildDonut(stats.distribution), [stats.distribution]);
  const donutData = donut.data;

  const topCategories = useMemo(() => donutData.slice(0, 5), [donutData]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [statsRes, gmailRes] = await Promise.all([
          doFetch("/dashboard/stats"),
          doFetch("/gmail/status").catch(() => null),
        ]);

        if (!statsRes.ok) {
          const txt = await statsRes.text().catch(() => "");
          throw new Error(`Stats HTTP ${statsRes.status} ${txt}`);
        }

        const payload = await statsRes.json().catch(() => ({}));
        const normalized = normalizeStats(payload);

        if (!cancelled) {
          setStats(normalized);
          if (gmailRes?.ok) {
            const gData = await gmailRes.json().catch(() => null);
            setGmailConnected(gData?.connected ?? false);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Erreur inconnue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Auto-refresh toutes les 60s pour garder les stats à jour sans rechargement manuel
    const interval = setInterval(load, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [doFetch]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tableau de Bord</h1>
        <p className="muted">Vue d’ensemble de l’activité de ton agence.</p>
      </div>

      {/* Bannière onboarding Gmail */}
      {gmailConnected === false && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 20px", marginBottom: 24, borderRadius: 10,
          background: "rgba(109,94,248,0.12)", border: "1px solid rgba(109,94,248,0.4)",
          color: "#c4b5fd",
        }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <span style={{ flex: 1 }}>
            Connectez votre boîte Gmail pour automatiser le traitement des emails.
          </span>
          <button
            className="btn btn-primary"
            style={{ padding: "6px 16px", fontSize: 13 }}
            onClick={() => navigate("/settings")}
          >
            Connecter Gmail
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      <div className="kpi-grid">
        <StatCard
          title="EMAILS TRAITÉS"
          value={loading ? "…" : stats.total_emails}
          icon={Mail}
          color="#6D5EF8"
          onClick={() => navigate("/emails/history")}
        />

        <StatCard
          title="URGENCE HAUTE"
          value={loading ? "…" : stats.high_urgency}
          icon={AlertTriangle}
          color="#E46C6C"
          onClick={() => navigate("/emails/history?filter=high_urgency")}
        />

        <div>
          <StatCard
            title="DOSSIERS LOCATAIRES"
            value={loading ? "…" : stats.tenant_files}
            icon={FileText}
            color="#44C2A8"
            onClick={() => navigate("/tenant-files")}
          />
          {!loading && stats.tenant_files_incomplete > 0 && (
            <div style={{ marginTop: 6, paddingLeft: 4, fontSize: 12, color: "#d97706", fontWeight: 600 }}>
              {stats.tenant_files_incomplete} incomplet{stats.tenant_files_incomplete > 1 ? "s" : ""}
            </div>
          )}
        </div>

      </div>

      <div className="dashboard-grid">
        {/* Donut + legend */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">📊 Répartition par Catégorie</h2>
            <span className="badge">{loading ? "…" : `${donut.total} emails`}</span>
          </div>

          {donutData.length === 0 ? (
            <div className="muted">Aucune donnée de catégorie pour l’instant.</div>
          ) : (
            <div className="donut-wrap">
              <div className="chart-box donut-box">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={72}
                      outerRadius={112}
                      paddingAngle={2}
                      onClick={(entry) => goToCategory(entry?.name)}
                    >
                      {donutData.map((slice, idx) => (
                        <Cell key={slice.name || idx} fill={getCategoryColor(slice.name, idx)} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="donut-legend">
                <div className="donut-legend-title">Top catégories</div>

                <div className="donut-legend-list">
                  {topCategories.map((c, idx) => (
                    <button
                      key={c.name}
                      type="button"
                      className="donut-legend-row"
                      onClick={() => goToCategory(c.name)}
                      title={`Voir les emails de la catégorie "${c.name}"`}
                    >
                      <span
                        className="donut-swatch"
                        style={{ background: getCategoryColor(c.name, idx) }}
                      />
                      <span className="donut-name">{c.name}</span>
                      <span className="donut-right">
                        <span className="donut-pct">{fmtPct(c.pct)}</span>
                        <span className="donut-count muted">{c.value}</span>
                      </span>
                    </button>
                  ))}
                </div>


                <div className="muted" style={{ marginTop: 10 }}>
                  Astuce : passe la souris sur le donut pour voir le détail.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Activité récente */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">⚡ Activité Récente</h2>

            {/* ✅ On garde UN seul bouton : Voir tout */}
            <button
              className="btn btn-ghost"
              onClick={() => navigate("/emails/history")}
            >
              Voir tout
            </button>
          </div>

          {loading ? (
            <div className="muted">Chargement…</div>
          ) : stats.recents.length === 0 ? (
            <div className="muted">Aucune activité pour l’instant.</div>
          ) : (
            <div className="list">
              {stats.recents.slice(0, 6).map((r) => {
                const subject = truncate(r.subject || "Email", 78);
                const category = r.category || "Autre";
                const priority = (r.priority || r.urgency || "").toString().toLowerCase();

                const badge =
                  priority.includes("high") || priority.includes("haute")
                    ? "badge badge-danger"
                    : priority.includes("medium") || priority.includes("moy")
                    ? "badge badge-warn"
                    : "badge badge-success";
                return (
                  
                  <button
                    key={r.id || `${subject}-${r.date}`}
                    type="button"
                    className="list-item list-item-strong"
                    onClick={() =>
                      navigate(r?.id ? `/emails/history?emailId=${r.id}` : "/emails/history")
                    }
                    title="Ouvrir cet email"
                  >
                    <div className="list-item-top">
                      <div className="list-item-title">{subject}</div>
                      <span className={badge}>
                        {priority ? priority.toUpperCase() : "NORMAL"}
                      </span>
                    </div>

                    <div className="list-item-sub muted">
                      <span>{category}</span>
                      <span className="dot">•</span>
                      <span>{r.date || ""}</span>
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
