import React, { useState } from 'react';
import { FileText, Download, CheckCircle, AlertCircle } from 'lucide-react';

const InvoiceGenerator = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // success | error

  // Champs modifiables
  const [formData, setFormData] = useState({
    client_name: "Client Test",
    invoice_number: "FAC-002",
    amount: "150.00"
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGenerate = async () => {
    setLoading(true);
    setStatus(null);
    const token = localStorage.getItem('cipherflow_token');
    
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
            date: new Date().toLocaleDateString("fr-FR"), // Date d'aujourd'hui auto
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
    <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ padding: '10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '8px' }}>
            <FileText size={24} color="#6366f1" />
        </div>
        <div>
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Générateur de Facture</h2>
            <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.9rem' }}>Créez et sauvegardez vos factures instantanément.</p>
        </div>
      </div>

      <div className="form-group">
        <label>Numéro de Facture</label>
        <input 
            type="text" 
            name="invoice_number" 
            value={formData.invoice_number} 
            onChange={handleChange} 
            placeholder="Ex: FAC-002"
        />
      </div>

      <div className="form-group">
        <label>Nom du Client</label>
        <input 
            type="text" 
            name="client_name" 
            value={formData.client_name} 
            onChange={handleChange} 
        />
      </div>

      <div className="form-group">
        <label>Montant Total (€)</label>
        <input 
            type="number" 
            name="amount" 
            value={formData.amount} 
            onChange={handleChange} 
        />
      </div>

      <button 
        className="btn btn-primary" 
        onClick={handleGenerate} 
        disabled={loading}
        style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}
      >
        {loading ? 'Génération en cours...' : '📥 Générer et Sauvegarder'}
        {!loading && <Download size={18} />}
      </button>

      {status === 'success' && (
          <div style={{ marginTop: '1rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
              <CheckCircle size={16} /> Facture téléchargée et enregistrée en base !
          </div>
      )}
      
      {status === 'error' && (
          <div style={{ marginTop: '1rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
              <AlertCircle size={16} /> Erreur : Ce numéro existe peut-être déjà.
          </div>
      )}
    </div>
  );
};

export default InvoiceGenerator;