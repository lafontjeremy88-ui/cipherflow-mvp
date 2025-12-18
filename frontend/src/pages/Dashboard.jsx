import React, { useEffect, useState } from 'react';
import { apiFetch } from "../services/api";
import { Users, AlertTriangle, FileText, PieChart as PieIcon, Activity } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const Dashboard = ({ token, onNavigate }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await apiFetch("/dashboard/stats");
        if (res?.ok) setStats(await res.json());
      } catch (e) {
        console.error("Erreur stats", e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div style={{ padding: 20 }}>Chargement...</div>;
  if (!stats) return <div style={{ padding: 20 }}>Aucune donnée.</div>;

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];

  const {
    total_emails = 0,
    total_clients = 0,
    total_invoices = 0,
    recent_activity = [],
    email_categories = []
  } = stats;

  const cardStyle = {
    background: '#111827',
    color: 'white',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
  };

  const containerStyle = {
    padding: 20,
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gap: 16
  };

  const titleStyle = { fontSize: 20, fontWeight: 700, marginBottom: 8 };

  const StatCard = ({ icon: Icon, label, value }) => (
    <div style={{ ...cardStyle, gridColumn: 'span 3' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} />
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={containerStyle}>
      <div style={{ gridColumn: 'span 12', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>Dashboard</div>
          <div style={{ opacity: 0.8 }}>Vue d’ensemble de CipherFlow</div>
        </div>
      </div>

      <StatCard icon={Activity} label="Emails traités" value={total_emails} />
      <StatCard icon={Users} label="Clients" value={total_clients} />
      <StatCard icon={FileText} label="Factures générées" value={total_invoices} />
      <StatCard icon={AlertTriangle} label="Alertes" value={0} />

      <div style={{ ...cardStyle, gridColumn: 'span 6', minHeight: 300 }}>
        <div style={titleStyle}><PieIcon size={18} style={{ marginRight: 8 }} />Catégories d’emails</div>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={email_categories}
                dataKey="count"
                nameKey="category"
                outerRadius={90}
                label
              >
                {email_categories.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ ...cardStyle, gridColumn: 'span 6', minHeight: 300 }}>
        <div style={titleStyle}>Activité récente</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recent_activity.length === 0 && <div style={{ opacity: 0.8 }}>Aucune activité récente.</div>}
          {recent_activity.map((item, idx) => (
            <button
              key={idx}
              onClick={() => onNavigate?.(item)}
              style={{
                textAlign: 'left',
                background: '#1f2937',
                color: 'white',
                border: 'none',
                padding: 12,
                borderRadius: 10,
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 700 }}>{item.title || 'Évènement'}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{item.subtitle || ''}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
