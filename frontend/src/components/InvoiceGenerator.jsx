import React, { useState, useEffect } from 'react';
import { FileText, Download, Loader2, Plus, Trash2, Calendar } from 'lucide-react';

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

const InvoiceGenerator = ({ token, authFetch }) => {
  const [loading, setLoading] = useState(false);
  const [companySettings, setCompanySettings] = useState({
    company_name: "Mon Entreprise",
    logo: "",
    signature: ""
  });

  // État du formulaire
  const [invoice, setInvoice] = useState({
    number: `FAC-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
    date: new Date().toISOString().split('T')[0],
    clientName: "",
    items: [{ description: "Prestation de service", price: 0 }]
  });

  // Charger les infos de l'entreprise au démarrage
  useEffect(() => {
    if (authFetch) {
      authFetch(`${API_BASE}/settings`)
        .then(res => res.json())
        .then(data => {
            if (data) setCompanySettings(data);
        })
        .catch(err => console.error("Erreur settings", err));
    }
  }, [authFetch]);

  // Gestion des changements dans le formulaire
  const handleChange = (field, value) => {
    setInvoice(prev => ({ ...prev, [field]: value }));
  };

  // Gestion des items (Lignes de facture)
  const handleItemChange = (index, field, value) => {
    const newItems = [...invoice.items];
    newItems[index][field] = value;
    setInvoice(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setInvoice(prev => ({
      ...prev,
      items: [...prev.items, { description: "Nouvelle prestation", price: 0 }]
    }));
  };

  const removeItem = (index) => {
    const newItems = invoice.items.filter((_, i) => i !== index);
    setInvoice(prev => ({ ...prev, items: newItems }));
  };

  // Calcul du total en temps réel
  const total = invoice.items.reduce((acc, item) => acc + Number(item.price || 0), 0);

  // Fonction pour télécharger le PDF officiel (via le Backend)
  const handleDownload = async () => {
    setLoading(true);
    try {
      const payload = {
        client_name: invoice.clientName || "Client",
        invoice_number: invoice.number,
        amount: total,
        date: new Date(invoice.date).toLocaleDateString("fr-FR"),
        items: invoice.items.map(i => ({ desc: i.description, price: Number(i.price) }))
      };

      const res = await authFetch(`${API_BASE}/api/generate-invoice`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Erreur génération PDF");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Facture-${invoice.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Erreur lors du téléchargement du PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", color: "white", maxWidth: "1600px", margin: "0 auto" }}>
      
      {/* En-tête avec bouton Télécharger */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.8rem", fontWeight: "bold" }}>Générateur de Factures</h2>
        <button 
            onClick={handleDownload} 
            disabled={loading}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 20px" }}
        >
            {loading ? <Loader2 className="spin" size={20} /> : <Download size={20} />}
            Télécharger le PDF Officiel
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3rem" }}>
        
        {/* --- COLONNE GAUCHE : ÉDITEUR --- */}
        <div>
          <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.5rem", color: "#94a3b8" }}>
            <FileText size={20} /> Éditeur de Facture
          </h3>

          <div className="card" style={{ padding: "2rem" }}>
            
            <h4 style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "1rem" }}>Informations</h4>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <div>
                <label style={{ fontSize: "0.9rem", marginBottom: "5px", display: "block" }}>Numéro de Facture</label>
                <input 
                    type="text" 
                    value={invoice.number} 
                    onChange={(e) => handleChange("number", e.target.value)}
                    style={{ width: "100%", padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white" }} 
                />
              </div>
              <div>
                <label style={{ fontSize: "0.9rem", marginBottom: "5px", display: "block" }}>Date d'émission</label>
                <div style={{ position: "relative" }}>
                    <input 
                        type="date" 
                        value={invoice.date} 
                        onChange={(e) => handleChange("date", e.target.value)}
                        style={{ width: "100%", padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white" }} 
                    />
                    <Calendar size={16} style={{ position: "absolute", right: "10px", top: "12px", color: "#94a3b8", pointerEvents: "none" }} />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "2rem" }}>
                <label style={{ fontSize: "0.9rem", marginBottom: "5px", display: "block" }}>Client (Nom / Entreprise)</label>
                <input 
                    type="text" 
                    placeholder="Ex: ACME Corp" 
                    value={invoice.clientName} 
                    onChange={(e) => handleChange("clientName", e.target.value)}
                    style={{ width: "100%", padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white" }} 
                />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h4 style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase" }}>Prestations</h4>
                <button onClick={addItem} style={{ background: "transparent", border: "none", color: "#6366f1", cursor: "pointer", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "5px" }}>
                    <Plus size={16} /> Ajouter
                </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {invoice.items.map((item, index) => (
                    <div key={index} style={{ display: "flex", gap: "10px" }}>
                        <input 
                            type="text" 
                            value={item.description} 
                            onChange={(e) => handleItemChange(index, "description", e.target.value)}
                            style={{ flex: 1, padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white" }} 
                        />
                        <input 
                            type="number" 
                            value={item.price} 
                            onChange={(e) => handleItemChange(index, "price", e.target.value)}
                            style={{ width: "100px", padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white", textAlign: "right" }} 
                        />
                        <button 
                            onClick={() => removeItem(index)}
                            style={{ background: "#331e1e", border: "1px solid #450a0a", color: "#f87171", borderRadius: "8px", width: "40px", cursor: "pointer", display: "grid", placeItems: "center" }}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: "2rem", padding: "1.5rem", background: "#0f172a", borderRadius: "12px", textAlign: "right" }}>
                <div style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", marginBottom: "5px" }}>Total Estimé</div>
                <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#6366f1" }}>{total.toFixed(2)} €</div>
            </div>

          </div>
        </div>

        {/* --- COLONNE DROITE : APERÇU LIVE (HTML/CSS) --- */}
        <div>
            {/* Simulation feuille A4 */}
            <div style={{ 
                background: "white", 
                color: "black", 
                width: "100%", 
                minHeight: "800px", // Hauteur fixe style A4
                padding: "40px", 
                borderRadius: "4px", 
                boxShadow: "0 0 20px rgba(0,0,0,0.5)",
                position: "relative"
            }}>
                
                {/* Header Facture */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "40px" }}>
                    <div>
                        <h1 style={{ margin: 0, color: "#2563eb", textTransform: "uppercase", fontSize: "1.5rem" }}>
                            {companySettings.company_name || "Mon Entreprise"}
                        </h1>
                        <p style={{ margin: "5px 0 0 0", fontSize: "0.8rem", color: "#64748b" }}>contact@monentreprise.com</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <h2 style={{ margin: 0, color: "#94a3b8", textTransform: "uppercase", fontSize: "1.5rem", fontWeight: "bold" }}>Facture</h2>
                        <div style={{ fontWeight: "bold", marginTop: "5px" }}>{invoice.number}</div>
                        <div style={{ fontSize: "0.9rem", color: "#64748b" }}>{new Date(invoice.date).toLocaleDateString()}</div>
                    </div>
                </div>

                {/* Client */}
                <div style={{ marginBottom: "60px", padding: "20px", background: "#f8fafc", borderRadius: "8px" }}>
                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", textTransform: "uppercase", marginBottom: "5px" }}>Facturé à</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>
                        {invoice.clientName || "Nom du Client..."}
                    </div>
                </div>

                {/* Tableau */}
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "40px" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                            <th style={{ textAlign: "left", padding: "10px 0", color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase" }}>Description</th>
                            <th style={{ textAlign: "right", padding: "10px 0", color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase" }}>Prix</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoice.items.map((item, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "15px 0" }}>{item.description}</td>
                                <td style={{ padding: "15px 0", textAlign: "right", fontWeight: "bold" }}>{Number(item.price).toFixed(2)} €</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Total */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ width: "200px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #1e293b", marginTop: "10px" }}>
                            <span style={{ fontWeight: "bold" }}>TOTAL NET</span>
                            <span style={{ fontWeight: "bold", fontSize: "1.2rem" }}>{total.toFixed(2)} €</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ position: "absolute", bottom: "40px", left: "40px", right: "40px", textAlign: "center", fontSize: "0.8rem", color: "#94a3b8" }}>
                    Merci de votre confiance.
                </div>

            </div>
        </div>

      </div>
    </div>
  );
};

export default InvoiceGenerator;