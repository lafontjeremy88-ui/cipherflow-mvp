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

  // --- STYLES EN LIGNE (POUR FORCER L'AFFICHAGE CORRECT) ---
  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", // Force 3 colonnes adaptables
    gap: "20px",
    marginBottom: "30px"
  };

  const cardStyle = {
    background: "#1e293b",
    padding: "24px",
    borderRadius: "16px",
    border: "1px solid #334155",
    display: "flex",
    alignItems: "center",
    gap: "20px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
  };

  const iconBoxStyle = (color, bg) => ({
    width: "50px",
    height: "50px",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: color,
    background: bg
  });

  const valueStyle = {
    fontSize: "2rem",
    fontWeight: "bold",
    color: "white",
    lineHeight: "1"
  };

  const labelStyle = {
    color: "#94a3b8",
    fontSize: "0.9rem",
    marginTop: "5px"
  };

  const mainCardStyle = {
    background: "#1e293b",
    padding: "24px",
    borderRadius: "16px",
    border: "1px solid #334155",
    height: "100%",
    minHeight: "400px",
    display: "flex",
    flexDirection: "column"
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "50px" }}>
      
      {/* --- CARTES KPI (GRID) --- */}
      <div style={gridStyle}>
        
        {/* CARTE 1 */}
        <div style={cardStyle}>
          <div style={iconBoxStyle("#6366f1", "rgba(99, 102, 241, 0.1)")}>
            <Mail size={24} />
          </div>
          <div>
            <div style={valueStyle}>{stats.kpis?.total_emails || 0}</div>
            <div style={labelStyle}>Emails Traités</div>
          </div>
        </div>

        {/* CARTE 2 */}
        <div style={cardStyle}>
          <div style={iconBoxStyle("#f59e0b", "rgba(245, 158, 11, 0.1)")}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={valueStyle}>{stats.kpis?.high_urgency || 0}</div>
            <div style={labelStyle}>Urgence Haute</div>
          </div>
        </div>

        {/* CARTE 3 */}
        <div style={cardStyle}>
          <div style={iconBoxStyle("#10b981", "rgba(16, 185, 129, 0.1)")}>
            <FileText size={24} />
          </div>
          <div>
            <div style={valueStyle}>{stats.kpis?.invoices || 0}</div>
            <div style={labelStyle}>Factures Générées</div>
          </div>
        </div>
      </div>

      {/* --- GRAPHIQUES ET LISTE (GRID 2 COLONNES) --- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "20px" }}>
        
        {/* Graphique */}
        <div style={mainCardStyle}>
          <h3 style={{ color: "white", marginBottom: "20px", fontSize: "1.2rem" }}>Répartition par Catégorie</h3>
          <div style={{ flex: 1, width: "100%", minHeight: "300px" }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100} // Radius fixe pour éviter l'écrasement
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "#fff" }} />
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

        {/* Liste Activité */}
        <div style={mainCardStyle}>
          <h3 style={{ color: "white", marginBottom: "20px", fontSize: "1.2rem" }}>Activité Récente</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {stats.recents && stats.recents.length > 0 ? (
              stats.recents.map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "15px", paddingBottom: "15px", borderBottom: "1px solid #334155" }}>
                  <div style={{ 
                    width: "10px", 
                    height: "10px", 
                    borderRadius: "50%", 
                    background: item.urgency === "haute" ? "#ef4444" : "#10b981",
                    boxShadow: item.urgency === "haute" ? "0 0 10px rgba(239, 68, 68, 0.5)" : "none"
                  }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "bold", color: "white", marginBottom: "4px" }}>{item.subject}</div>
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