import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Loader2, Plus, Trash2, Calendar, Eye, RefreshCw } from 'lucide-react';

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

const InvoiceGenerator = ({ token, authFetch }) => {
  const [loading, setLoading] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [history, setHistory] = useState([]); // ✅ État pour stocker l'historique
  const [companySettings, setCompanySettings] = useState({
    company_name: "Mon Entreprise",
    logo: "",
    signature: ""
  });

  const [invoice, setInvoice] = useState({
    number: `FAC-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
    date: new Date().toISOString().split('T')[0],
    clientName: "",
    items: [{ description: "Loyer mensuel", price: 0 }]
  });

  // --- FONCTION POUR CHARGER L'HISTORIQUE ---
  const fetchHistory = useCallback(async () => {
    if (!authFetch) return;
    try {
      const res = await authFetch(`${API_BASE}/api/invoices`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error("Erreur historique", e);
    }
  }, [authFetch]);

  // Chargement initial
  useEffect(() => {
    if (authFetch) {
      // 1. Charger les settings
      authFetch(`${API_BASE}/settings`)
        .then(res => res.json())
        .then(data => { if (data) setCompanySettings(data); })
        .catch(err => console.error("Erreur settings", err));

      // 2. Charger l'historique
      fetchHistory();
    }
  }, [authFetch, fetchHistory]);

  const handleChange = (field, value) => {
    setInvoice(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...invoice.items];
    newItems[index][field] = value;
    setInvoice(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setInvoice(prev => ({ ...prev, items: [...prev.items, { description: "Nouvelle prestation", price: 0 }] }));
  };

  const removeItem = (index) => {
    const newItems = invoice.items.filter((_, i) => i !== index);
    setInvoice(prev => ({ ...prev, items: newItems }));
  };

  const total = invoice.items.reduce((acc, item) => acc + Number(item.price || 0), 0);

  const getPayload = () => ({
    client_name: invoice.clientName || "Client",
    invoice_number: invoice.number,
    amount: total,
    date: new Date(invoice.date).toLocaleDateString("fr-FR"),
    items: invoice.items.map(i => ({ desc: i.description, price: Number(i.price) }))
  });

  // Action : Visionner PDF
  const handleView = async () => {
    if (!authFetch) return alert("Erreur: Authentification manquante");
    setViewLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/generate-invoice`, {
        method: "POST",
        body: JSON.stringify(getPayload()),
      });
      if (!res.ok) throw new Error("Erreur génération PDF");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      fetchHistory(); // ✅ Mise à jour auto de l'historique après génération
    } catch (e) {
      alert("Erreur génération aperçu");
    } finally {
      setViewLoading(false);
    }
  };

  // Action : Télécharger PDF
  const handleDownload = async () => {
    if (!authFetch) return alert("Erreur: Authentification manquante");
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/generate-invoice`, {
        method: "POST",
        body: JSON.stringify(getPayload()),
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
      fetchHistory(); // ✅ Mise à jour auto de l'historique après téléchargement
    } catch (e) {
      alert("Erreur téléchargement");
    } finally {
      setLoading(false);
    }
  };

  // Action : Ouvrir une ancienne facture depuis l'historique
  const handleHistoryOpen = async (ref) => {
    if (!authFetch) return;
    try {
        const res = await authFetch(`${API_BASE}/api/invoices/${ref}/pdf`);
        if(res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        } else {
            alert("Impossible de récupérer ce PDF");
        }
    } catch(e) {
        console.error(e);
    }
  };

  return (
    <div style={{ padding: "2rem", color: "white", maxWidth: "1600px", margin: "0 auto" }}>
      
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.8rem", fontWeight: "bold" }}>Générateur de Quittances</h2>
        <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={handleView} disabled={viewLoading} className="btn" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 20px", background: "#3b82f6", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                {viewLoading ? <Loader2 className="spin" size={20} /> : <Eye size={20} />} Visionner PDF
            </button>
            <button onClick={handleDownload} disabled={loading} className="btn" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 20px", background: "#10b981", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                {loading ? <Loader2 className="spin" size={20} /> : <Download size={20} />} Télécharger
            </button>
        </div>
      </div>

      {/* ZONE PRINCIPALE : ÉDITEUR + APERÇU */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3rem", marginBottom: "4rem" }}>
        
        {/* ÉDITEUR */}
        <div>
          <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.5rem", color: "#94a3b8" }}>
            <FileText size={20} /> Éditeur de Quittances
          </h3>
          <div className="card" style={{ padding: "2rem", background: "#1e293b", borderRadius: "12px" }}>
            <h4 style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase", marginBottom: "1rem" }}>Informations</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <div>
                <label style={{ fontSize: "0.9rem", marginBottom: "5px", display: "block" }}>Numéro</label>
                <input type="text" value={invoice.number} onChange={(e) => handleChange("number", e.target.value)} style={{ width: "100%", padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white" }} />
              </div>
              <div>
                <label style={{ fontSize: "0.9rem", marginBottom: "5px", display: "block" }}>Date</label>
                <div style={{ position: "relative" }}>
                    <input type="date" value={invoice.date} onChange={(e) => handleChange("date", e.target.value)} style={{ width: "100%", padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white" }} />
                    <Calendar size={16} style={{ position: "absolute", right: "10px", top: "12px", color: "#94a3b8", pointerEvents: "none" }} />
                </div>
              </div>
            </div>
            <div style={{ marginBottom: "2rem" }}>
                <label style={{ fontSize: "0.9rem", marginBottom: "5px", display: "block" }}>Locataires</label>
                <input type="text" placeholder="Ex: ACME Corp" value={invoice.clientName} onChange={(e) => handleChange("clientName", e.target.value)} style={{ width: "100%", padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h4 style={{ color: "#64748b", fontSize: "0.8rem", fontWeight: "bold", textTransform: "uppercase" }}>Prestations</h4>
                <button onClick={addItem} style={{ background: "transparent", border: "none", color: "#6366f1", cursor: "pointer", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "5px" }}><Plus size={16} /> Ajouter</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {invoice.items.map((item, index) => (
                    <div key={index} style={{ display: "flex", gap: "10px" }}>
                        <input type="text" value={item.description} onChange={(e) => handleItemChange(index, "description", e.target.value)} style={{ flex: 1, padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white" }} />
                        <input type="number" value={item.price} onChange={(e) => handleItemChange(index, "price", e.target.value)} style={{ width: "100px", padding: "10px", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", color: "white", textAlign: "right" }} />
                        <button onClick={() => removeItem(index)} style={{ background: "#331e1e", border: "1px solid #450a0a", color: "#f87171", borderRadius: "8px", width: "40px", cursor: "pointer", display: "grid", placeItems: "center" }}><Trash2 size={16} /></button>
                    </div>
                ))}
            </div>
            <div style={{ marginTop: "2rem", padding: "1.5rem", background: "#0f172a", borderRadius: "12px", textAlign: "right" }}>
                <div style={{ color: "#94a3b8", fontSize: "0.8rem", textTransform: "uppercase", marginBottom: "5px" }}>Total Estimé</div>
                <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#6366f1" }}>{total.toFixed(2)} €</div>
            </div>
          </div>
        </div>

        {/* APERÇU LIVE */}
        <div>
            <div style={{ background: "white", color: "black", width: "100%", minHeight: "800px", padding: "40px", borderRadius: "4px", boxShadow: "0 0 20px rgba(0,0,0,0.5)", position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "40px" }}>
                    <div>
                        <h1 style={{ margin: 0, color: "#2563eb", textTransform: "uppercase", fontSize: "1.5rem" }}>{companySettings.company_name || "Mon Entreprise"}</h1>
                        <p style={{ margin: "5px 0 0 0", fontSize: "0.8rem", color: "#64748b" }}>contact@monentreprise.com</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <h2 style={{ margin: 0, color: "#94a3b8", textTransform: "uppercase", fontSize: "1.5rem", fontWeight: "bold" }}>Facture</h2>
                        <div style={{ fontWeight: "bold", marginTop: "5px" }}>{invoice.number}</div>
                        <div style={{ fontSize: "0.9rem", color: "#64748b" }}>{new Date(invoice.date).toLocaleDateString()}</div>
                    </div>
                </div>
                <div style={{ marginBottom: "60px", padding: "20px", background: "#f8fafc", borderRadius: "8px" }}>
                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", textTransform: "uppercase", marginBottom: "5px" }}>Facturé à</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>{invoice.clientName || "Nom du Client..."}</div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "40px" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #e2e8f0" }}><th style={{ textAlign: "left", padding: "10px 0", color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase" }}>Description</th><th style={{ textAlign: "right", padding: "10px 0", color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase" }}>Prix</th></tr>
                    </thead>
                    <tbody>
                        {invoice.items.map((item, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}><td style={{ padding: "15px 0" }}>{item.description}</td><td style={{ padding: "15px 0", textAlign: "right", fontWeight: "bold" }}>{Number(item.price).toFixed(2)} €</td></tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ width: "200px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid #1e293b", marginTop: "10px" }}><span style={{ fontWeight: "bold" }}>TOTAL NET</span><span style={{ fontWeight: "bold", fontSize: "1.2rem" }}>{total.toFixed(2)} €</span></div>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* --- NOUVELLE ZONE HISTORIQUE --- */}
      <div style={{ borderTop: "1px solid #334155", paddingTop: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "1.4rem", fontWeight: "bold" }}>📜 Historique des Factures</h3>
            <button onClick={fetchHistory} style={{ background: "transparent", border: "none", color: "#6366f1", cursor: "pointer" }}><RefreshCw size={18} /></button>
        </div>

        {history.length === 0 ? (
            <div style={{ padding: "20px", background: "#1e293b", borderRadius: "8px", textAlign: "center", color: "#94a3b8" }}>Aucune facture générée pour le moment.</div>
        ) : (
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px" }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: "left", color: "#94a3b8", padding: "10px" }}>Numéro</th>
                            <th style={{ textAlign: "left", color: "#94a3b8", padding: "10px" }}>Date</th>
                            <th style={{ textAlign: "left", color: "#94a3b8", padding: "10px" }}>Client</th>
                            <th style={{ textAlign: "left", color: "#94a3b8", padding: "10px" }}>Montant</th>
                            <th style={{ textAlign: "left", color: "#94a3b8", padding: "10px" }}>Statut</th>
                            <th style={{ textAlign: "right", color: "#94a3b8", padding: "10px" }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.map((inv) => (
                            <tr key={inv.id} style={{ background: "#1e293b" }}>
                                <td style={{ padding: "15px", borderTopLeftRadius: "8px", borderBottomLeftRadius: "8px", fontWeight: "bold", color: "#6366f1" }}>{inv.reference}</td>
                                <td style={{ padding: "15px" }}>{inv.date_issued ? new Date(inv.date_issued).toLocaleDateString() : "-"}</td>
                                <td style={{ padding: "15px" }}>{inv.client_name}</td>
                                <td style={{ padding: "15px", fontWeight: "bold" }}>{inv.amount_total} €</td>
                                <td style={{ padding: "15px" }}>
                                    <span style={{ background: "rgba(16,185,129,0.2)", color: "#34d399", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8rem" }}>ÉMISE</span>
                                </td>
                                <td style={{ padding: "15px", textAlign: "right", borderTopRightRadius: "8px", borderBottomRightRadius: "8px" }}>
                                    <button onClick={() => handleHistoryOpen(inv.reference)} style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "6px", borderRadius: "6px", cursor: "pointer" }} title="Voir le PDF">
                                        <Eye size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>

    </div>
  );
};

export default InvoiceGenerator;