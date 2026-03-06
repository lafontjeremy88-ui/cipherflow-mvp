import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Mail, AlertTriangle, FileText, FolderOpen, TrendingUp, Activity } from "lucide-react";
import { authFetch as authFetchFromApi } from "../services/api";

import StatCard from "../components/ui/StatCard";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import ActivityItem from "../components/ui/ActivityItem";
import EmailsChart from "../components/charts/EmailsChart";

// ── Couleurs catégories ────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  Autre: "#6D5EF8",
  Administratif: "#44C2A8",
  Candidature: "#F4B04F",
  Incident: "#E46C6C",
  Lead_location: "#0ea5e9",
  Lead_vente: "#22c55e",
  Propriétaire: "#f97316",
  Locataire: "#a855f7",
  Gestion: "#eab308",
  Notaire: "#6366f1",
  Banque: "#14b8a6",
  Spam: "#ef4444",
};
const FALLBACK_COLORS = ["#6D5EF8", "#44C2A8", "#F4B04F", "#4F8EF7", "#E46C6C"];

function getCategoryColor(name, idx) {
  if (name && CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

// ── Data normalization ────────────────────────────────────────────────────────

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
    tenant_files: Number(kpis?.tenant_files || kpis?.tenantfiles || kpis?.dossiers || 0),
    tenant_files_incomplete: Number(kpis?.tenant_files_incomplete || 0),
    documents_verified: Number(kpis?.documents_verified ?? 0),
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

function buildDonut(dist) {
  let arr = [];
  if (Array.isArray(dist)) {
    arr = dist.map((d) => ({ name: String(d?.name || ""), value: Number(d?.value) || 0 })).filter((d) => d.name && d.value > 0);
  } else if (dist && typeof dist === "object") {
    arr = Object.entries(dist).map(([name, value]) => ({ name, value: Number(value) || 0 })).filter((d) => d.name && d.value > 0);
  }
  const total = arr.reduce((s, x) => s + x.value, 0) || 1;
  arr.sort((a, b) => b.value - a.value);
  return { total, data: arr.map((x) => ({ ...x, pct: (x.value / total) * 100 })) };
}

function truncate(s, n = 65) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtPct(x) {
  return `${Math.round(Number.isFinite(x) ? x : 0)}%`;
}

// ── User helper ───────────────────────────────────────────────────────────────

function getUserNameFromToken() {
  try {
    const token = localStorage.getItem('access_token')
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1]))
    const email = payload.email || payload.sub || null
    return email ? email.split('@')[0] : null
  } catch {
    return null
  }
}

// ── Dashboard greeting ────────────────────────────────────────────────────────

function DashboardGreeting({ userName }) {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const dateStr = now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const dateFormatted = dateStr.charAt(0).toUpperCase() + dateStr.slice(1)
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-xl font-semibold text-[#0F172A]">
          {greeting}{userName ? `, ${userName}` : ''} 👋
        </h2>
        <p className="text-sm text-[#94A3B8] mt-0.5">{dateFormatted}</p>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-xs font-medium text-green-700">Surveillance active</span>
      </div>
    </div>
  )
}

// ── Tooltip donut ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="bg-white border border-surface-border rounded-xl px-3 py-2 shadow-card-hover">
      <p className="text-xs font-bold text-ink mb-1">{p.name}</p>
      <p className="text-xs text-ink-secondary">
        <span className="font-semibold text-ink">{p.value}</span> emails ({fmtPct(p.pct)})
      </p>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-surface-border p-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div>
          <div className="h-3 w-20 bg-surface-muted rounded mb-3" />
          <div className="h-8 w-12 bg-surface-muted rounded" />
        </div>
        <div className="w-10 h-10 rounded-full bg-surface-muted" />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard({ authFetch }) {
  const navigate = useNavigate();
  const doFetch = authFetch || authFetchFromApi;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    total_emails: 0,
    high_urgency: 0,
    tenant_files: 0,
    tenant_files_incomplete: 0,
    documents_verified: 0,
    distribution: [],
    recents: [],
  });
  const [gmailConnected, setGmailConnected] = useState(null);
  const [outlookConnected, setOutlookConnected] = useState(null);

  const donut = useMemo(() => buildDonut(stats.distribution), [stats.distribution]);
  const topCategories = useMemo(() => donut.data.slice(0, 5), [donut.data]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [statsRes, gmailRes, outlookRes] = await Promise.all([
          doFetch("/dashboard/stats"),
          doFetch("/gmail/status").catch(() => null),
          doFetch("/outlook/status").catch(() => null),
        ]);
        if (!statsRes.ok) throw new Error(`Stats HTTP ${statsRes.status}`);
        const payload = await statsRes.json().catch(() => ({}));
        if (!cancelled) {
          setStats(normalizeStats(payload));
          if (gmailRes?.ok) {
            const gData = await gmailRes.json().catch(() => null);
            setGmailConnected(gData?.connected ?? false);
          }
          if (outlookRes?.ok) {
            const oData = await outlookRes.json().catch(() => null);
            setOutlookConnected(oData?.connected ?? false);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Erreur inconnue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [doFetch]);

  const goToCategory = (name) => {
    if (!name) return;
    navigate(`/emails/history?category=${encodeURIComponent(name)}`);
  };

  return (
    <div className="space-y-6 opacity-0 animate-[fadeIn_0.3s_ease-in-out_forwards]">
      <style>{`@keyframes fadeIn { to { opacity: 1; } }`}</style>

      {/* Bannière connexion email manquante */}
      {gmailConnected === false && outlookConnected === false && (
        <div className="flex items-center gap-4 px-5 py-3.5 rounded-xl bg-blue-50 border border-blue-200">
          <span className="text-blue-600 font-bold text-base">⚡</span>
          <p className="flex-1 text-sm text-blue-800">
            Connectez votre boîte email (Gmail ou Outlook) pour automatiser le traitement des emails.
          </p>
          <button
            className="px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            onClick={() => navigate("/settings")}
          >
            Connecter
          </button>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      <DashboardGreeting userName={getUserNameFromToken()} />

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              icon={Mail}
              label="Emails analysés"
              value={stats.total_emails ?? 0}
              color="blue"
              onClick={() => navigate("/emails/history")}
            />
            <StatCard
              icon={FolderOpen}
              label="Dossiers locataires"
              value={stats.tenant_files ?? 0}
              sublabel={stats.tenant_files_incomplete > 0 ? `${stats.tenant_files_incomplete} incomplet(s)` : undefined}
              color="teal"
              onClick={() => navigate("/tenant-files")}
            />
            <StatCard
              icon={FileText}
              label="Documents vérifiés"
              value={stats.documents_verified ?? 0}
              color="violet"
              onClick={() => navigate("/documents")}
            />
            <StatCard
              icon={AlertTriangle}
              label="Alertes (urgence haute)"
              value={stats.high_urgency ?? 0}
              color="orange"
              onClick={() => navigate("/emails/history?filter=high_urgency")}
            />
          </>
        )}
      </div>

      {/* Middle row : chart + activité */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graphique emails */}
        <Card className="lg:col-span-2" padding="md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Emails traités</h2>
              <p className="text-xs text-ink-tertiary mt-0.5">Activité de traitement par période</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <TrendingUp size={16} className="text-blue-600" />
            </div>
          </div>
          <EmailsChart />
        </Card>

        {/* Activité récente */}
        <Card padding="md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Activité récente</h2>
            </div>
            <button
              onClick={() => navigate("/emails/history")}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
            >
              Voir tout
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-surface-muted flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-3 bg-surface-muted rounded w-3/4 mb-1.5" />
                    <div className="h-2.5 bg-surface-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-ink-tertiary uppercase tracking-wide mb-2">Aujourd'hui</p>
              {stats.recents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-10 h-10 bg-[#F1F5F9] rounded-xl flex items-center justify-center mb-3">
                    <Activity className="h-5 w-5 text-[#CBD5E1]" />
                  </div>
                  <p className="text-sm text-[#94A3B8]">Aucune activité pour l'instant</p>
                  <p className="text-xs text-[#CBD5E1] mt-1">Les événements apparaîtront ici</p>
                </div>
              ) : (
                stats.recents.slice(0, 5).map((r) => {
                  const subject = truncate(r.subject || "Email");
                  const category = r.category || "Autre";
                  const priority = (r.priority || r.urgency || "").toString().toLowerCase();
                  const isHigh = priority.includes("high") || priority.includes("haute");

                  return (
                    <ActivityItem
                      key={r.id || subject}
                      icon={Mail}
                      iconBg={isHigh ? "bg-red-50" : "bg-blue-50"}
                      iconColor={isHigh ? "text-red-500" : "text-blue-600"}
                      title={subject}
                      subtitle={`${category} · ${r.date || ""}`}
                      onClick={() => navigate(r?.id ? `/emails/history?emailId=${r.id}` : "/emails/history")}
                    />
                  );
                })
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Donut répartition + résultats récents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut */}
        <Card padding="md" className="lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink">Répartition</h2>
            <Badge variant="neutral">{loading ? "…" : `${donut.total} emails`}</Badge>
          </div>

          {donut.data.length === 0 ? (
            <div className="text-sm text-ink-tertiary py-6 text-center">Aucune donnée.</div>
          ) : (
            <>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donut.data}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      onClick={(entry) => goToCategory(entry?.name)}
                    >
                      {donut.data.map((slice, idx) => (
                        <Cell key={slice.name || idx} fill={getCategoryColor(slice.name, idx)} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                {topCategories.map((c, idx) => (
                  <button
                    key={c.name}
                    onClick={() => goToCategory(c.name)}
                    className="flex items-center gap-1.5 hover:opacity-75 transition-opacity"
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: getCategoryColor(c.name, idx) }}
                    />
                    <span className="text-xs text-[#475569]">{c.name}</span>
                    <span className="text-xs font-semibold text-[#0F172A]">{c.value}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Résultats récents — tableau */}
        <Card padding="md" className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink">Emails récents</h2>
            <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
              <Activity size={15} className="text-ink-secondary" />
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-surface-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : stats.recents.length === 0 ? (
            <div className="text-sm text-ink-tertiary py-6 text-center">Aucune activité pour l'instant.</div>
          ) : (
            <div className="divide-y divide-surface-border">
              {stats.recents.slice(0, 6).map((r) => {
                const subject = truncate(r.subject || "Email", 55);
                const category = r.category || "Autre";
                const priority = (r.priority || r.urgency || "").toString().toLowerCase();
                const isHigh = priority.includes("high") || priority.includes("haute");
                const isMedium = priority.includes("medium") || priority.includes("moy");

                return (
                  <button
                    key={r.id || subject}
                    onClick={() => navigate(r?.id ? `/emails/history?emailId=${r.id}` : "/emails/history")}
                    className="flex items-center gap-3 w-full text-left py-2.5 hover:bg-surface-bg rounded-lg px-2 -mx-2 transition-colors duration-150"
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: getCategoryColor(category, 0) }}
                    />
                    <span className="flex-1 text-sm text-ink truncate font-medium">{subject}</span>
                    <span className="text-xs text-ink-tertiary flex-shrink-0 hidden sm:block">{category}</span>
                    <Badge variant={isHigh ? "danger" : isMedium ? "warning" : "neutral"} className="flex-shrink-0">
                      {isHigh ? "Haute" : isMedium ? "Moyenne" : "Normale"}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
