// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { getDashboardStats } from "../services/api";

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
        const data = await getDashboardStats();

        // On tolère plusieurs formats possibles venant du backend
        const normalized = {
          emails_processed:
            data?.emails_processed ?? data?.emailsProcessed ?? data?.emails ?? 0,
          high_urgency:
            data?.high_urgency ?? data?.highUrgency ?? data?.urgent ?? 0,
          invoices_generated:
            data?.invoices_generated ?? data?.invoicesGenerated ?? data?.invoices ?? 0,
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
    <div className="page">
      <h1>Tableau de Bord</h1>

      {loading && <p>Chargement…</p>}
      {error && <p style={{ color: "tomato" }}>{error}</p>}

      {!loading && !error && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{stats.emails_processed}</div>
            <div className="stat-label">Emails Traités</div>
          </div>

          <div className="stat-card">
            <div className="stat-number">{stats.high_urgency}</div>
            <div className="stat-label">Urgence Haute</div>
          </div>

          <div className="stat-card">
            <div className="stat-number">{stats.invoices_generated}</div>
            <div className="stat-label">Quittances Générées</div>
          </div>
        </div>
      )}
    </div>
  );
}
