import React, { useEffect, useState } from 'react';
import { Users, AlertTriangle, FileText, PieChart as PieIcon, Activity } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const Dashboard = ({ token, onNavigate }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Couleurs Pro Modernes
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
  const API_URL = "https://cipherflow-mvp-production.up.railway.app";

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const userToken = token || localStorage.getItem('cipherflow_token');
        if (!userToken) { setLoading(false); return; }

        const res = await fetch(`${API_URL}/dashboard/stats`, {
          headers: { 'Authorization': `Bearer ${userToken}`, 'Content-Type': 'application/json' }
        });
        if (res.ok) setStats(await res.json());
      } catch (e) { console.error("Erreur stats", e); } 
      finally { setLoading(false); }
    };
    fetchStats();
  }, [token]);

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center', color: '#6366f1' }}><Activity className="spin" size={40}/>Chargement...</div>;

  const distributionData = stats?.charts?.distribution?.length > 0 ? stats.charts.distribution : [{ name: 'Aucune donnée', value: 1 }];
  const recentActivity = stats?.recents || [];

  // --- FONCTION POUR AFFICHER LES POURCENTAGES ---
  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    // On n'affiche pas le texte si la part est trop petite (moins de 5%)
    if (percent < 0.05) return null;

    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" style={{ fontSize: '12px', fontWeight: 'bold' }}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Tableau de Bord</h1>
        <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Données en temps réel</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Cartes KPI */}
        <div className="card clickable-row" onClick={() => onNavigate && onNavigate('history')} style={{ background: 'linear-gradient(135deg, rgba(30,41,59,1) 0%, rgba(99,102,241,0.15) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div><div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '5px' }}>Emails Traités</div><div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'white' }}>{stats?.kpis?.total_emails || 0}</div></div>
            <div style={{ padding: '12px', background: 'rgba(99,102,241,0.2)', borderRadius: '12px', color: '#818cf8' }}><Users size={24} /></div>
          </div>
        </div>

        <div className="card clickable-row" onClick={() => onNavigate && onNavigate('history')} style={{ background: 'linear-gradient(135deg, rgba(30,41,59,1) 0%, rgba(239,68,68,0.15) 100%)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div><div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '5px' }}>Urgences Hautes</div><div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#f87171' }}>{stats?.kpis?.high_urgency || 0}</div></div>
            <div style={{ padding: '12px', background: 'rgba(239,68,68,0.2)', borderRadius: '12px', color: '#f87171' }}><AlertTriangle size={24} /></div>
          </div>
        </div>

        <div className="card clickable-row" onClick={() => onNavigate && onNavigate('invoices')} style={{ background: 'linear-gradient(135deg, rgba(30,41,59,1) 0%, rgba(16,185,129,0.15) 100%)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div><div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '5px' }}>Factures Générées</div><div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#34d399' }}>{stats?.kpis?.invoices || 0}</div></div>
            <div style={{ padding: '12px', background: 'rgba(16,185,129,0.2)', borderRadius: '12px', color: '#34d399' }}><FileText size={24} /></div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        
        {/* --- PIE CHART PRO (Donut Style avec %) --- */}
        <div className="card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
            <PieIcon size={20} color="#8b5cf6"/> Répartition des Demandes
          </h3>
          <div style={{ width: '100%', height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                    data={distributionData} 
                    cx="50%" cy="50%" 
                    innerRadius={80} 
                    outerRadius={110} 
                    paddingAngle={5} 
                    dataKey="value" 
                    stroke="none"
                    cornerRadius={5}
                    label={renderCustomizedLabel} // <--- C'est ici qu'on ajoute les labels
                    labelLine={false}             // Pas de ligne qui sort du camembert
                >
                  {distributionData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                </Pie>
                <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#1e293b', fontWeight: 'bold' }} 
                    itemStyle={{ color: '#1e293b' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* --- ACTIVITÉ RÉCENTE --- */}
        <div className="card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', marginBottom: '1.5rem' }}>
            <Activity size={20} color="#f59e0b"/> Activité Récente
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {recentActivity.map((item) => (
                <div 
                    key={item.id} 
                    onClick={() => onNavigate && onNavigate('history', item.id)} 
                    className="clickable-row"
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: `3px solid ${item.urgency === 'haute' ? '#ef4444' : '#6366f1'}` }}
                >
                    <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{item.subject}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{item.category} • {item.date}</div>
                    </div>
                </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
