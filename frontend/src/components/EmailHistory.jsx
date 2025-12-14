import React, { useEffect, useState } from 'react';
import { Mail, ArrowLeft, X } from 'lucide-react';

const EmailHistory = ({ token, initialId }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null); // Pour la vue détail

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch("https://cipherflow-mvp-production.up.railway.app/email/history", {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            setHistory(data);
            
            // Si on a reçu un ID depuis le Dashboard, on l'ouvre direct !
            if (initialId) {
                const found = data.find(item => item.id === initialId);
                if (found) setSelectedEmail(found);
            }
        }
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    };
    fetchHistory();
  }, [token, initialId]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement...</div>;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', position: 'relative' }}>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: 'bold' }}>Historique des Emails</h2>
      
      {/* LISTE DES EMAILS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {history.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', background: '#1e293b', borderRadius: '8px' }}>Aucun historique.</div>
        ) : (
            history.map((item) => (
                <div 
                    key={item.id} 
                    onClick={() => setSelectedEmail(item)}
                    style={{ cursor: 'pointer', background: '#1e293b', padding: '1.5rem', borderRadius: '12px', border: '1px solid #334155', transition: 'background 0.2s' }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#334155'}
                    onMouseOut={(e) => e.currentTarget.style.background = '#1e293b'}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{item.subject}</div>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{new Date(item.created_at || Date.now()).toLocaleDateString()}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
                        <span style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>{item.category}</span>
                        <span style={{ background: item.urgency === 'haute' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', color: item.urgency === 'haute' ? '#f87171' : '#34d399', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>{item.urgency}</span>
                    </div>
                    <p style={{ color: '#cbd5e1', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.summary}</p>
                </div>
            ))
        )}
      </div>

      {/* MODAL DETAIL (POP-UP) */}
      {selectedEmail && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
            <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #334155', position: 'relative' }}>
                <button onClick={() => setSelectedEmail(null)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={24}/></button>
                
                <h2 style={{ marginBottom: '1.5rem', paddingRight: '30px' }}>{selectedEmail.subject}</h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div><label style={{color:'#94a3b8', fontSize:'0.85rem'}}>Expéditeur</label><div>{selectedEmail.sender_email}</div></div>
                    <div><label style={{color:'#94a3b8', fontSize:'0.85rem'}}>Date</label><div>{new Date(selectedEmail.created_at).toLocaleString()}</div></div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{color:'#6366f1', fontWeight:'bold', display:'block', marginBottom:'5px'}}>RÉSUMÉ IA</label>
                    <div style={{ background: 'rgba(99,102,241,0.1)', padding: '1rem', borderRadius: '8px', color: '#e2e8f0' }}>{selectedEmail.summary}</div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{color:'#94a3b8', fontWeight:'bold', display:'block', marginBottom:'5px'}}>MESSAGE ORIGINAL</label>
                    <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px', color: '#94a3b8', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{selectedEmail.raw_email_text}</div>
                </div>

                <div>
                    <label style={{color:'#10b981', fontWeight:'bold', display:'block', marginBottom:'5px'}}>RÉPONSE SUGGÉRÉE</label>
                    <div style={{ background: 'rgba(16,185,129,0.1)', padding: '1rem', borderRadius: '8px', color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>{selectedEmail.suggested_response_text}</div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default EmailHistory;