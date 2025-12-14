import React, { useEffect, useState } from 'react';
import { Users, AlertTriangle, FileText, PieChart as PieIcon, Activity, ArrowRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const Dashboard = ({ token }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Palette "Dark Modern"
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
  const API_URL = "https://cipherflow-mvp-production.up.railway.app";

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/dashboard/stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
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

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Tableau de Bord</h1>
        <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Données en temps réel</div>
      </div>

      {/* 1. LIGNE DES KPIs (Avec Dégradés) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* CARTE 1 */}
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(30,41,59,1) 0%, rgba(99,102,241,0.15) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '5px' }}>Emails Traités</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'white' }}>{stats?.kpis?.total_emails || 0}</div>
            </div>
            <div style={{ padding: '12px', background: 'rgba(99,102,241,0.2)', borderRadius: '12px', color: '#818cf8' }}><Users size={24} /></div>
          </div>
        </div>

        {/* CARTE 2 */}
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(30,41,59,1) 0%, rgba(239,68,68,0.15) 100%)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '5px' }}>Urgences Hautes</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#f87171' }}>{stats?.kpis?.high_urgency || 0}</div>
            </div>
            <div style={{ padding: '12px', background: 'rgba(239,68,68,0.2)', borderRadius: '12px', color: '#f87171' }}><AlertTriangle size={24} /></div>
          </div>
        </div>

        {/* CARTE 3 */}
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(30,41,59,1) 0%, rgba(16,185,129,0.15) 100%)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '5px' }}>Factures Générées</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#34d399' }}>{stats?.kpis?.invoices || 0}</div>
            </div>
            <div style={{ padding: '12px', background: 'rgba(16,185,129,0.2)', borderRadius: '12px', color: '#34d399' }}><FileText size={24} /></div>
          </div>
        </div>

      </div>

      {/* 2. ZONE PRINCIPALE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        
        {/* GRAPHIQUE */}
        <div className="card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
            <PieIcon size={20} color="#8b5cf6"/> Répartition des Demandes
          </h3>
          <div style={{ flex: 1, width: '100%', minHeight: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distributionData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={5} dataKey="value" stroke="none">
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FIL D'ACTUALITÉ (Remplaçant le graphique vide) */}
        <div className="card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem' }}>
              <Activity size={20} color="#f59e0b"/> Activité Récente
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {recentActivity.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', marginTop: '3rem' }}>Aucune activité récente.</div>
            ) : (
                recentActivity.map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: `3px solid ${item.urgency === 'haute' ? '#ef4444' : '#6366f1'}` }}>
                        <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.subject}</div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{item.category} • {item.date}</div>
                        </div>
                        <div style={{ background: item.urgency === 'haute' ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)', color: item.urgency === 'haute' ? '#f87171' : '#818cf8', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', marginLeft: '10px', whiteSpace: 'nowrap' }}>
                            {item.urgency.toUpperCase()}
                        </div>
                    </div>
                ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;