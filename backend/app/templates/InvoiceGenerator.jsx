import React, { useState } from 'react';

const InvoiceGenerator = () => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    client_name: "Client Test",
    invoice_number: "FAC-2025-001",
    amount: "500.00",
    date: new Date().toLocaleDateString('fr-FR'),
    items: [
      { desc: "Prestation IA", price: "400.00" },
      { desc: "Frais de dossier", price: "100.00" }
    ]
  });

  const handleGenerate = async () => {
    setLoading(true);
    const token = localStorage.getItem('access_token'); // On récupère le token de connexion

    try {
      const response = await fetch('http://127.0.0.1:8000/api/generate-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Indispensable car la route est protégée
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la génération");
      }

      // 1. On récupère le fichier binaire (Blob)
      const blob = await response.blob();
      
      // 2. On crée une URL temporaire pour ce fichier
      const url = window.URL.createObjectURL(blob);
      
      // 3. On crée un lien invisible et on clique dessus pour forcer le téléchargement
      const a = document.createElement('a');
      a.href = url;
      a.download = `facture_${formData.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      
      // 4. Nettoyage
      a.remove();
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur: Impossible de générer la facture. Êtes-vous bien connecté ?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '20px', backgroundColor: '#f9f9f9' }}>
      <h3>📄 Générateur de Facture</h3>
      
      <div style={{ marginBottom: '10px' }}>
        <label>Client : </label>
        <input 
          value={formData.client_name}
          onChange={(e) => setFormData({...formData, client_name: e.target.value})}
          style={{ marginLeft: '10px', padding: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label>Montant (€) : </label>
        <input 
          value={formData.amount}
          onChange={(e) => setFormData({...formData, amount: e.target.value})}
          style={{ marginLeft: '10px', padding: '5px' }}
        />
      </div>

      <button 
        onClick={handleGenerate} 
        disabled={loading}
        style={{
          padding: '10px 20px',
          backgroundColor: loading ? '#ccc' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontWeight: 'bold'
        }}
      >
        {loading ? 'Génération en cours...' : '📥 Télécharger la Facture PDF'}
      </button>
    </div>
  );
};

export default InvoiceGenerator;