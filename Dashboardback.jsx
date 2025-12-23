// Remplacez tout le contenu de Dashboard.jsx par ceci :
import React, { useEffect, useState } from "react";
import { Users, AlertTriangle, FileText, PieChart as PieIcon, Activity } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
// ON RETIRE L'IMPORT DE apiFetch car on va utiliser celle passée en props
// import { apiFetch } from "../services/api"; 

const API_BASE = "https://cipherflow-mvp-production.up.railway.app"; // Assurez-vous que c'est la bonne URL

// On ajoute authFetch dans les props
const Dashboard = ({ token, onNavigate, authFetch }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"];

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        // CORRECTION ICI : On utilise authFetch si dispo, sinon fallback manuel
        let res;
        if (authFetch) {
             // authFetch gère déjà les headers et l'URL complète si configuré, 
             // mais dans App.jsx authFetch prend une URL complète.
             res = await authFetch(`${API_BASE}/dashboard/stats`);
        } else {
             // Fallback de sécurité (si authFetch n'est pas passé)
             res = await fetch(`${API_BASE}/dashboard/stats`, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}` // On injecte le token manuellement
                }
             });
        }

        if (res?.ok) {
          const data = await res.json();
          setStats(data);
        } else {
          setStats(null);
        }
      } catch (e) {
        console.error("Erreur stats", e);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    
    // On lance le fetch uniquement si le token est là
    if (token) {
        fetchStats();
    }
  }, [token, authFetch]); // Dépendances mises à jour

  if (loading) {
    return (
      <div style={{ padding: "4rem", textAlign: "center", color: "#6366f1" }}>
        <Activity className="spin" size={40} /> Chargement...
      </div>
    );
  }

  // ... LE RESTE DU FICHIER NE CHANGE PAS ...
  if (!stats) return <div style={{ padding: 20 }}>Aucune donnée (Vérifiez la connexion API).</div>;

  const distributionData =
    Array.isArray(stats?.charts?.distribution) && stats.charts.distribution.length > 0
      ? stats.charts.distribution
      : [{ name: "Aucune donnée", value: 1 }];

  const recentActivity = Array.isArray(stats?.recents) ? stats.recents : [];
  const RADIAN = Math.PI / 180;
  
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: "bold" }}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: "bold" }}>Tableau de Bord</h1>
        <div style={{ fontSize: "0.9rem", color: "#94a3b8" }}>Données en temps réel</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
        <div className="card clickable-row" onClick={() => onNavigate?.("history")}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: 5 }}>Emails Traités</div>
              <div style={{ fontSize: "2.5rem", fontWeight: "bold" }}>{stats?.kpis?.total_emails || 0}</div>
            </div>
            <div style={{ padding: 12, background: "rgba(99,102,241,0.2)", borderRadius: 12 }}><Users size={24} /></div>
          </div>
        </div>
        <div className="card clickable-row" onClick={() => onNavigate?.("history")}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: 5 }}>Urgences Hautes</div>
              <div style={{ fontSize: "2.5rem", fontWeight: "bold" }}>{stats?.kpis?.high_urgency || 0}</div>
            </div>
            <div style={{ padding: 12, background: "rgba(239,68,68,0.2)", borderRadius: 12 }}><AlertTriangle size={24} /></div>
          </div>
        </div>
        <div className="card clickable-row" onClick={() => onNavigate?.("invoices")}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: 5 }}>Factures Générées</div>
              <div style={{ fontSize: "2.5rem", fontWeight: "bold" }}>{stats?.kpis?.invoices || 0}</div>
            </div>
            <div style={{ padding: 12, background: "rgba(16,185,129,0.2)", borderRadius: 12 }}><FileText size={24} /></div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2rem" }}>
        <div className="card" style={{ minHeight: 400, display: "flex", flexDirection: "column" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem", fontSize: "1.1rem" }}><PieIcon size={20} /> Répartition des Demandes</h3>
          <div style={{ width: "100%", height: 300, minHeight: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distributionData} cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={5} dataKey="value" stroke="none" cornerRadius={5} label={renderCustomizedLabel} labelLine={false}>
                  {distributionData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ minHeight: 400, display: "flex", flexDirection: "column" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem", fontSize: "1.1rem" }}><Activity size={20} /> Activité Récente</h3>
          {recentActivity.length === 0 ? (
            <div style={{ opacity: 0.8 }}>Aucune activité récente.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {recentActivity.map((item) => (
                <div key={item.id} className="clickable-row" onClick={() => onNavigate?.("history", item.id)} style={{ cursor: "pointer", padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, borderLeft: `3px solid ${item.urgency === "haute" ? "#ef4444" : "#6366f1"}` }}>
                  <div style={{ fontWeight: "bold" }}>{item.subject}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{item.category} • {item.date}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;