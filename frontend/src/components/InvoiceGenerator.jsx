import React, { useState, useEffect } from 'react';
import { FileText, Download, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

const InvoiceGenerator = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [invoices, setInvoices] = useState([]); // Pour stocker l'historique
  const [formData, setFormData] = useState({
    client_name: "Client Test",
    invoice_number: "", // On laisse vide pour forcer à remplir ou automatiser plus tard
    amount: "150.00"
  });

  const token = localStorage.getItem('cipherflow_token');

  // 1. Charger l'historique au démarrage
  const fetchInvoices = async () => {
    try {
      const res = await fetch('https://cipherflow-mvp-production.up.railway.app/api/invoices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
        
        // PETITE ASTUCE INTELLIGENTE (Brique B - Préparation) 💡
        // Si on a des factures, on propose automatiquement le numéro suivant !
        if (data.length > 0) {
            const lastRef = data[0].reference; // ex: FAC-003
            const parts = lastRef.split('-');
            if (parts.length === 2) {
                const nextNum = parseInt(parts[1]) + 1;
                setFormData(prev => ({ ...prev, invoice_number: `FAC-${String(nextNum).padStart(3, '0')}` }));
            }
        } else {
            setFormData(prev => ({ ...prev, invoice_number: "FAC-001" }));
        }
      }
    } catch (e) { console.error("Erreur historique", e); }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGenerate = async () => {
    setLoading(true);
    setStatus(null);
    
    try {
      const response = await fetch('https://cipherflow-mvp-production.up.railway.app/api/generate-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            client_name: formData.client_name,
            invoice_number: formData.invoice_number,
            amount: formData.amount,
            date: new Date().toLocaleDateString("fr-FR"),
            items: [{desc: "Prestation IA & Automatisation", price: formData.amount}]
        })
      });

      if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `facture_${formData.invoice_number}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          
          setStatus('success');
          fetchInvoices(); // 🔄 On rafraîchit la liste immédiatement !
      } else {
          setStatus('error');
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      
      {/* ZONE GÉNÉRATEUR */}
      <div className="card">
        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px' }}>
                <FileText size={24} color="#6366f1" />
            </div>
            <div>
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Nouvelle Facture</h2>
                <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.9rem' }}>Le numéro est calculé automatiquement (modifiable).</p>
            </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '1rem' }}>
            <div className="form-group">
                <label>Numéro</label>
                <input type="text" name="invoice_number" value={formData.invoice_number} onChange={handleChange} />
            </div>
            <div className="form-group">
                <label>Client</label>
                <input type="text" name="client_name" value={formData.client_name} onChange={handleChange} />
            </div>
            <div className="form-group">
                <label>Montant (€)</label>
                <input type="number" name="amount" value={formData.amount} onChange={handleChange} />
            </div>
        </div>

        <button className="btn btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
            {loading ? 'Génération...' : '📥 Générer et Sauvegarder'}
        </button>

        {status === 'success' && <div style={{ marginTop: '1rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle size={16} /> Facture créée !</div>}
        {status === 'error' && <div style={{ marginTop: '1rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={16} /> Erreur (Doublon ?)</div>}
      </div>

      {/* ZONE HISTORIQUE (NOUVEAU) */}
      <h3 style={{ marginTop: '3rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          📜 Historique des Factures
          <button onClick={fetchInvoices} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1' }}><RefreshCw size={18}/></button>
      </h3>
      
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <tr>
                    <th style={{ padding: '12px 20px' }}>Numéro</th>
                    <th style={{ padding: '12px 20px' }}>Date</th>
                    <th style={{ padding: '12px 20px' }}>Client</th>
                    <th style={{ padding: '12px 20px' }}>Montant</th>
                    <th style={{ padding: '12px 20px' }}>Statut</th>
                </tr>
            </thead>
            <tbody>
                {invoices.length === 0 ? (
                    <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Aucune facture pour l'instant.</td></tr>
                ) : (
                    invoices.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '12px 20px', fontWeight: 'bold', color: '#6366f1' }}>{inv.reference}</td>
                            <td style={{ padding: '12px 20px' }}>{new Date(inv.date_issued).toLocaleDateString()}</td>
                            <td style={{ padding: '12px 20px' }}>{inv.client_name}</td>
                            <td style={{ padding: '12px 20px', fontWeight: 'bold' }}>{inv.amount_total} €</td>
                            <td style={{ padding: '12px 20px' }}><span className="badge badge-success">{inv.status}</span></td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
      </div>

    </div>
  );
};

export default InvoiceGenerator;