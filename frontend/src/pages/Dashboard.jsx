// frontend/src/pages/Dashboard.jsx

import React, { useEffect, useRef, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

// Petit helper pour éviter les doubles appels en dev (React StrictMode)
function useOnceEffect(effect) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default function DashboardPage({ authFetch, onLogout, email }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useOnceEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        // ✅ IMPORTANT: chemin relatif, et le BON endpoint
        const res = await authFetch("/dashboard/stats");

        if (res.status === 401) {
          // authFetch tente déjà refresh; si on arrive ici c’est que ça a échoué
          await onLogout?.();
          return;
        }

        if (!res.ok) {
          console.error("Erreur /dashboard/stats:", res.status);
          setStats(null);
          return;
        }

        const data = await res.json();
        setStats(data);
      } catch (e) {
        console.error("Erreur dashboard:", e);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  });

  // ---- UI simple (tu peux garder ton design, l’important est le fetch) ----
  if (loading) {
    return <div style={{ color: "white", padding: 20 }}>Chargement…</div>;
  }

  if (!stats) {
    return (
      <div style={{ color: "white", padding: 20 }}>
        Impossible de charger les stats.
      </div>
    );
  }

  const emailsTraites = stats.emails_processed ?? stats.emailsTraites ?? 0;
  const urgences = stats.high_priority ?? stats.urgences ?? 0;
  const quittances = stats.invoices_generated ?? stats.quittances ?? 0;

  const pieData = [
    { name: "Traités", value: emailsTraites },
    { name: "Urgences", value: urgences },
    { name: "Quittances", value: quittances },
  ].filter((x) => Number(x.value) > 0);

  return (
    <div style={{ padding: 24, color: "white" }}>
      <h1 style={{ marginBottom: 16 }}>Tableau de Bord</h1>
      <div style={{ opacity: 0.8, marginBottom: 20 }}>
        Connecté : {email || "—"}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={cardStyle}>
          <div style={cardNumber}>{emailsTraites}</div>
          <div style={cardLabel}>Emails traités</div>
        </div>
        <div style={cardStyle}>
          <div style={cardNumber}>{urgences}</div>
          <div style={cardLabel}>Urgence haute</div>
        </div>
        <div style={cardStyle}>
          <div style={cardNumber}>{quittances}</div>
          <div style={cardLabel}>Quittances générées</div>
        </div>
      </div>

      <h2 style={{ marginTop: 28, marginBottom: 12 }}>Répartition</h2>

      {/* ✅ Fix Recharts: donner une vraie hauteur au container */}
      <div style={{ height: 280, background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 12 }}>
        {pieData.length === 0 ? (
          <div style={{ opacity: 0.7, padding: 12 }}>Aucune donnée à afficher.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip />
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const cardStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: 18,
  minWidth: 220,
};

const cardNumber = {
  fontSize: 34,
  fontWeight: 800,
  lineHeight: 1,
};

const cardLabel = {
  marginTop: 8,
  opacity: 0.75,
};
