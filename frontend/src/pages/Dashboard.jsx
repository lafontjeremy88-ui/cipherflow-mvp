import React, { useEffect, useState } from 'react';
import { BarChart, Users, AlertTriangle, FileText, PieChart as PieIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const Dashboard = ({ token }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Couleurs pro pour les graphiques (Palette CipherFlow)
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];

  const API_URL = "https://cipherflow-mvp-production.up.railway.app";

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/dashboard/stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error("Erreur stats", e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [token]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#6366f1' }}>Chargement du cockpit...</div>;

  // Données par défaut si vide pour éviter le crash du graphique
  const distributionData = stats?.charts?.distribution?.length > 0 
    ? stats.charts.distribution 
    : [{ name: 'Aucune donnée', value: 1 }];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      <h1 style={{ fontSize: '2rem', marginBottom: '2rem', fontWeight: 'bold' }}>Tableau de Bord</h1>

      {/* 1. LIGNE DES KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '12px', color: '#6366f1' }}>
            <Users size={32} />
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Emails Traités</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats?.kpis?.total_emails || 0}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', color: '#ef4444' }}>
            <AlertTriangle size={32} />
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Urgences Hautes</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats?.kpis?.high_urgency || 0}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', color: '#10b981' }}>
            <FileText size={32} />
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Factures Générées</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{stats?.kpis?.invoices || 0}</div>
          </div>
        </div>

      </div>

      {/* 2. ZONE GRAPHIQUE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        
        {/* GRAPHIQUE CAMEMBERT */}
        <div className="card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
            <PieIcon size={20} color="#8b5cf6"/> Répartition des Demandes
          </h3>
          <div style={{ flex: 1, width: '100%', minHeight: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PLACEHOLDER FUTUR */}
        <div className="card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderColor: '#334155' }}>
          <BarChart size={48} color="#475569" />
          <p style={{ marginTop: '1rem', color: '#94a3b8' }}>Activité Hebdomadaire (Bientôt disponible)</p>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;