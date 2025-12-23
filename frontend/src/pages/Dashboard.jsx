import React, { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { BarChart3, Mail, FileText, AlertTriangle } from "lucide-react";

// Couleurs du graphique
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444"];

const DashboardPage = ({ token, authFetch }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await authFetch("https://cipherflow-mvp-production.up.railway.app/dashboard/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Erreur stats:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [authFetch]);

  if (loading) return <div style={{ color: "white", padding: "20px" }}>Chargement des données...</div>;
  if (!stats) return <div style={{ color: "white", padding: "20px" }}>Erreur de chargement.</div>;

  const chartData = stats.charts?.distribution || [];

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* --- CARTES KPI --- */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="icon-wrapper" style={{ background: "rgba(99, 102, 241, 0.1)", color: "#6366f1" }}>
            <Mail size={24} />
          </div>
          <div>
            <div className="stat-value">{stats.kpis?.total_emails || 0}</div>
            <div className="stat-label">Emails Traités</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="icon-wrapper" style={{ background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b" }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div className="stat-value">{stats.kpis?.high_urgency || 0}</div>
            <div className="stat-label">Urgence Haute</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="icon-wrapper" style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>
            <FileText size={24} />
          </div>
          <div>
            <div className="stat-value">{stats.kpis?.invoices || 0}</div>
            <div className="stat-label">Factures Générées</div>
          </div>
        </div>
      </div>

      {/* --- GRAPHIQUES ET ACTIVITÉ --- */}
      <div className="dashboard-grid" style={{ marginTop: "2rem" }}>
        
        {/* Graphique avec Hauteur Fixe pour éviter le bug d'affichage */}
        <div className="card">
          <h3>Répartition par Catégorie</h3>
          {/* FIX: On force une hauteur précise ici */}
          <div style={{ width: "100%", height: "300px", marginTop: "20px" }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px", color: "#fff" }} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                Pas assez de données pour afficher le graphique
              </div>
            )}
          </div>
        </div>

        {/* Liste Activité Récente */}
        <div className="card">
          <h3>Activité Récente</h3>
          <div className="activity-list" style={{ marginTop: "20px" }}>
            {stats.recents && stats.recents.length > 0 ? (
              stats.recents.map((item) => (
                <div key={item.id} className="activity-item">
                  <div className={`status-dot ${item.urgency === "haute" ? "urgent" : "normal"}`}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "bold", color: "white" }}>{item.subject}</div>
                    <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{item.category} • {item.date}</div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>Aucune activité récente</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;