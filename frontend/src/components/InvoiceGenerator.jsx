import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Download, FileText } from 'lucide-react';

const InvoiceGenerator = ({ token }) => {
  const API_BASE = "https://cipherflow-mvp-production.up.railway.app";
  
  // État pour stocker les infos de l'entreprise (Logo, Nom)
  const [companySettings, setCompanySettings] = useState(null);

  // État de la facture
  const [invoiceData, setInvoiceData] = useState({
    invoice_number: `FAC-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
    date: new Date().toISOString().split('T')[0],
    client_name: "",
    items: [{ desc: "Prestation de service", price: 0 }]
  });

  const [loading, setLoading] = useState(false);

  // --- 1. RÉCUPÉRER LE LOGO ET LE NOM DE L'ENTREPRISE ---
  useEffect(() => {
    if (!token) return;
    
    fetch(`${API_BASE}/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setCompanySettings(data))
    .catch(err => console.error("Erreur chargement logo:", err));
  }, [token]);

  // --- LOGIQUE DE CALCUL ---
  const calculateTotal = () => {
    return invoiceData.items.reduce((acc, item) => acc + (parseFloat(item.price) || 0), 0).toFixed(2);
  };

  // --- GESTION DES CHAMPS ---
  const handleItemChange = (index, field, value) => {
    const newItems = [...invoiceData.items];
    newItems[index][field] = value;
    setInvoiceData({ ...invoiceData, items: newItems });
  };

  const addItem = () => {
    setInvoiceData({ ...invoiceData, items: [...invoiceData.items, { desc: "Nouvelle ligne", price: 0 }] });
  };

  const removeItem = (index) => {
    const newItems = invoiceData.items.filter((_, i) => i !== index);
    setInvoiceData({ ...invoiceData, items: newItems });
  };

  // --- GÉNÉRATION PDF (Appel Backend) ---
  const handleGeneratePDF = async () => {
    setLoading(true);
    try {
      const payload = {
        client_name: invoiceData.client_name || "Client Inconnu",
        invoice_number: invoiceData.invoice_number,
        amount: calculateTotal(),
        date: invoiceData.date,
        items: invoiceData.items
        // Le backend utilisera ses propres settings pour le PDF
      };

      const res = await fetch(`${API_BASE}/api/generate-invoice`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${invoiceData.invoice_number}.pdf`;
        a.click();
      } else {
        alert("Erreur lors de la création du PDF");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur serveur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', height: 'calc(100vh - 100px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText color="#6366f1"/> Éditeur de Facture
        </h1>
        <button 
            onClick={handleGeneratePDF}
            disabled={loading}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#6366f1', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
            {loading ? "Génération..." : "Télécharger le PDF Officiel"} <Download size={18}/>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', height: '100%' }}>
        
        {/* --- COLONNE GAUCHE : FORMULAIRE --- */}
        <div style={{ background: '#1e293b', padding: '2rem', borderRadius: '16px', overflowY: 'auto', border: '1px solid #334155' }}>
            <h3 style={{ color: '#94a3b8', marginBottom: '1.5rem', textTransform: 'uppercase', fontSize: '0.9rem', fontWeight: 'bold' }}>Informations</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#cbd5e1' }}>Numéro de Facture</label>
                    <input 
                        type="text" 
                        value={invoiceData.invoice_number} 
                        onChange={(e) => setInvoiceData({...invoiceData, invoice_number: e.target.value})}
                        style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white' }}
                    />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#cbd5e1' }}>Date d'émission</label>
                    <input 
                        type="date" 
                        value={invoiceData.date} 
                        onChange={(e) => setInvoiceData({...invoiceData, date: e.target.value})}
                        style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white' }}
                    />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#cbd5e1' }}>Client (Nom / Entreprise)</label>
                    <input 
                        type="text" 
                        placeholder="Ex: ACME Corp"
                        value={invoiceData.client_name} 
                        onChange={(e) => setInvoiceData({...invoiceData, client_name: e.target.value})}
                        style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white' }}
                    />
                </div>
            </div>

            <h3 style={{ color: '#94a3b8', marginBottom: '1rem', textTransform: 'uppercase', fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                Prestations
                <button onClick={addItem} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}><Plus size={16}/> Ajouter</button>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {invoiceData.items.map((item, index) => (
                    <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input 
                            type="text" 
                            value={item.desc} 
                            onChange={(e) => handleItemChange(index, 'desc', e.target.value)}
                            style={{ flex: 2, padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white' }}
                        />
                        <input 
                            type="number" 
                            placeholder="0.00"
                            value={item.price} 
                            onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                            style={{ flex: 1, padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', color: 'white', textAlign: 'right' }}
                        />
                        <button onClick={() => removeItem(index)} style={{ background: 'rgba(239,68,68,0.2)', border: 'none', color: '#f87171', padding: '10px', borderRadius: '6px', cursor: 'pointer' }}>
                            <Trash2 size={18}/>
                        </button>
                    </div>
                ))}
            </div>
            
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(99,102,241,0.1)', borderRadius: '12px', textAlign: 'right' }}>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>TOTAL ESTIMÉ</div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#6366f1' }}>{calculateTotal()} €</div>
            </div>
        </div>

        {/* --- COLONNE DROITE : APERÇU LIVE (LOOK PAPIER) --- */}
        <div style={{ background: '#0f172a', padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto' }}>
            
            {/* LA FEUILLE A4 */}
            <div style={{ 
                width: '100%', 
                maxWidth: '600px', 
                background: 'white', 
                minHeight: '800px', 
                padding: '40px', 
                color: '#1e293b', 
                boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5)',
                borderRadius: '4px',
                position: 'relative'
            }}>
                {/* EN-TÊTE */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem' }}>
                    <div>
                        {/* --- C'EST ICI QUE LE LOGO S'AFFICHE AUTOMATIQUEMENT --- */}
                        {companySettings?.logo ? (
                            <img 
                                src={companySettings.logo} 
                                alt="Logo Entreprise" 
                                style={{ maxHeight: '60px', marginBottom: '10px', display: 'block' }}
                            />
                        ) : (
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6366f1', marginBottom: '5px' }}>
                                {companySettings?.company_name || "MON ENTREPRISE"}
                            </div>
                        )}
                        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>contact@monentreprise.com</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '2rem', fontWeight: '900', color: '#cbd5e1', textTransform: 'uppercase' }}>Facture</div>
                        <div style={{ fontWeight: 'bold' }}>{invoiceData.invoice_number}</div>
                        <div style={{ fontSize: '0.9rem', color: '#64748b' }}>{invoiceData.date}</div>
                    </div>
                </div>

                {/* DESTINATAIRE */}
                <div style={{ marginBottom: '3rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', marginBottom: '5px', textTransform: 'uppercase' }}>Facturé à</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{invoiceData.client_name || "Nom du Client..."}</div>
                </div>

                {/* LIGNES */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                            <th style={{ padding: '10px 0', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase' }}>Description</th>
                            <th style={{ padding: '10px 0', textAlign: 'right', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase' }}>Prix</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoiceData.items.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '15px 0', fontWeight: '500' }}>{item.desc || "Description..."}</td>
                                <td style={{ padding: '15px 0', textAlign: 'right', fontWeight: 'bold' }}>{item.price} €</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* TOTAL */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ minWidth: '200px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid #1e293b' }}>
                            <span style={{ fontWeight: 'bold' }}>TOTAL NET</span>
                            <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{calculateTotal()} €</span>
                        </div>
                    </div>
                </div>

                {/* FOOTER */}
                <div style={{ position: 'absolute', bottom: '40px', left: '40px', right: '40px', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                    Merci de votre confiance. Paiement dû sous 30 jours.
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default InvoiceGenerator;