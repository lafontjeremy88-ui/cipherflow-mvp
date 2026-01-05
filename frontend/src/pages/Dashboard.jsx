// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { getDashboardStats } from "../services/api";
import StatCard from "../components/StatCard";
import { Mail, AlertTriangle, FileText } from "lucide-react";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    emails_processed: 0,
    high_urgency: 0,
    invoices_generated: 0,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const result = await getDashboardStats();

        // ✅ Supporte les 2 formats possibles :
        // - soit getDashboardStats() renvoie directement les stats
        // - soit il renvoie { res, data }
        const data = result?.data ?? result;

        const normalized = {
          emails_processed:
            data?.emails_processed ?? data?.emailsProcessed ?? data?.emails ?? 0,
          high_urgency:
            data?.high_urgency ?? data?.highUrgency ?? data?.urgent ?? 0,
          invoices_generated:
            data?.invoices_generated ??
            data?.invoicesGenerated ??
            data?.invoices ??
            0,
        };

        if (alive) setStats(normalized);
      } catch (e) {
        if (alive) setError(e?.message || "Erreur lors du chargement des stats.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>
          Tableau de Bord
        </h1>
        <p style={{ opacity: 0.8, marginTop: 6 }}>
          Vue d’ensemble de l’activité de ton agence.
        </p>
      </header>

      {error && (
        <div
          className="card"
          style={{
            border: "1px solid rgba(248,113,113,0.35)",
            background: "rgba(248,113,113,0.08)",
            color: "#fecaca",
          }}
        >
          {error}
        </div>
      )}

      {/* ✅ Grid “garanti” (même si un CSS manque, ça restera beau) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
          gap: "1.25rem",
          marginTop: "1.25rem",
        }}
      >
        <StatCard
          title="Emails traités"
          value={loading ? "…" : stats.emails_processed}
          icon={Mail}
          color="#6366f1"
        />
        <StatCard
          title="Urgence haute"
          value={loading ? "…" : stats.high_urgency}
          icon={AlertTriangle}
          color="#f59e0b"
        />
        <StatCard
          title="Quittances générées"
          value={loading ? "…" : stats.invoices_generated}
          icon={FileText}
          color="#22c55e"
        />
      </div>

      {/* ✅ Responsive simple */}
      <style>{`
        @media (max-width: 1000px) {
          .dashboard-grid-fix {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
