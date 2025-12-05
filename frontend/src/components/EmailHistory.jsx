import React, { useEffect, useState } from 'react';
import { Eye, X, Mail, MessageSquare } from 'lucide-react';

// 1. On récupère le 'token' dans les props
const EmailHistory = ({ token }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEmail, setSelectedEmail] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // 2. CORRECTION DE L'URL : ajout de /email/history à la fin
      const response = await fetch("https://cipherflow-mvp-production.up.railway.app/email/history", {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // <--- LA CLÉ D'ENTRÉE
        }
      });

      if (response.status === 401) {
        throw new Error("Session expirée, veuillez vous reconnecter.");
      }
      if (!response.ok) throw new Error('Erreur réseau');
      
      const data = await response.json();
      setHistory(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // On ne lance la requête que si on a un token
    if (token) fetchHistory();
  }, [token]);

  const getUrgencyColor = (urgency) => {
    switch (urgency?.toLowerCase()) {
      case 'haute': return 'badge-danger';
      case 'moyenne': return 'badge-warning';
      case 'basse': return 'badge-success';
      default: return 'badge-info';
    }
  };

  if (loading && history.length === 0) return <p>Chargement de l'historique...</p>;
  if (error) return <p style={{ color: '#ef4444' }}>Erreur : {error}</p>;

  return (
    <div className="card" style={{ marginTop: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          📜 Historique des Analyses
        </h3>
        <button onClick={fetchHistory} className="btn" style={{ padding: '5px 10px', fontSize: '0.9rem', backgroundColor: '#334155' }}>
          🔄 Actualiser
        </button>
      </div>

      {history.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Aucun historique pour le moment.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px' }}>ID</th>
                <th style={{ padding: '12px' }}>Date</th>
                <th style={{ padding: '12px' }}>Expéditeur</th>
                <th style={{ padding: '12px' }}>Catégorie</th>
                <th style={{ padding: '12px' }}>Urgence</th>
                <th style={{ padding: '12px' }}>Résumé</th>
                <th style={{ padding: '12px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr 
                  key={item.id} 
                  className="clickable-row"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  onClick={() => setSelectedEmail(item)}
                >
                  <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>#{item.id}</td>
                  <td style={{ padding: '12px', fontSize: '0.9rem' }}>
                    {new Date(item.created_at).toLocaleDateString()} <br/>
                    <span style={{color: 'var(--text-secondary)', fontSize:'0.8rem'}}>
                        {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>{item.sender_email}</td>
                  <td style={{ padding: '12px' }}>
                    <span className="badge badge-info">{item.category}</span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span className={`badge ${getUrgencyColor(item.urgency)}`}>
                      {item.urgency}
                    </span>
                  </td>
                  <td style={{ padding: '12px', maxWidth: '250px', fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.summary}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <Eye size={18} color="var(--accent)" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedEmail && (
        <div className="modal-overlay" onClick={() => setSelectedEmail(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Détails de l'analyse #{selectedEmail.id}</h2>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {new Date(selectedEmail.created_at).toLocaleString()}
                </span>
              </div>
              <button className="close-btn" onClick={() => setSelectedEmail(null)}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
               <div className={`badge ${getUrgencyColor(selectedEmail.urgency)}`}>
                  Urgence : {selectedEmail.urgency}
               </div>
               <div className="badge badge-info">
                  {selectedEmail.category}
               </div>
            </div>

            <div className="detail-section">
              <h4><Mail size={14} style={{display:'inline', marginRight:'6px'}}/> Email du Client ({selectedEmail.sender_email})</h4>
              <div className="detail-box" style={{ borderLeft: '3px solid var(--accent)' }}>
                <strong>Objet : {selectedEmail.subject}</strong>
                <br/><br/>
                {selectedEmail.raw_email_text}
              </div>
            </div>

            <div className="detail-section">
              <h4><MessageSquare size={14} style={{display:'inline', marginRight:'6px'}}/> Réponse Envoyée</h4>
              <div className="detail-box" style={{ borderLeft: '3px solid var(--success)' }}>
                <strong>Objet : {selectedEmail.suggested_title}</strong>
                <br/><br/>
                {selectedEmail.suggested_response_text}
              </div>
            </div>

            <div style={{ textAlign: 'right', marginTop: '2rem' }}>
              <button className="btn btn-primary" onClick={() => setSelectedEmail(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailHistory;