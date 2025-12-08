import React, { useState } from 'react';

const InvoiceGenerator = () => {
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    const token = localStorage.getItem('cipherflow_token');
    try {
      // On utilise l'URL de production de Railway
      const response = await fetch('https://cipherflow-mvp-production.up.railway.app/api/generate-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            client_name: "Client Test",
            invoice_number: "FAC-001",
            amount: "100",
            date: "08/12/2025",
            items: [{desc: "Service IA", price: "100"}]
        })
      });

      if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = "facture.pdf";
          document.body.appendChild(a);
          a.click();
          a.remove();
      } else {
          alert("Erreur génération PDF");
      }
    } catch (error) {
      console.error(error);
      alert("Erreur technique");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', background: 'white', borderRadius: '8px', color: 'black', marginTop: '20px' }}>
      <h2 style={{fontSize: '1.2rem', marginBottom: '10px'}}>Facturation Rapide</h2>
      <button 
        onClick={handleGenerate} 
        disabled={loading}
        style={{ padding: '10px 20px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
      >
        {loading ? 'Génération...' : '📥 Télécharger une Facture Test'}
      </button>
    </div>
  );
};

export default InvoiceGenerator;