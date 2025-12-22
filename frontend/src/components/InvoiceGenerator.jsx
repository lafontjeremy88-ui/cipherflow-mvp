import React, { useState, useEffect } from 'react';
import { FileText, Download, Loader2, AlertCircle } from 'lucide-react';
// ❌ apiFetch supprimé
// import { apiFetch } from "../services/api";

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

const InvoiceGenerator = ({ token, authFetch }) => { // ✅
  const [companySettings, setCompanySettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    client_name: "",
    client_email: "",
    invoice_number: `${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
    description: "Prestation",
    amount: 100,
  });

  useEffect(() => {
    if (!authFetch) return;
    
    // On charge les settings de l'entreprise
    authFetch(`${API_BASE}/settings`)
      .then((res) => res.json())
      .then((data) => setCompanySettings(data))
      .catch((err) => console.error("Erreur chargement settings:", err));
  }, [authFetch]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const generateInvoice = async () => {
    setLoading(true);
    setError("");

    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        company_settings: companySettings,
      };

      const res = await authFetch(`${API_BASE}/api/generate-invoice`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Erreur génération facture");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `facture_${form.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    background: "#111827",
    border: "1px solid #374151",
    color: "white",
    padding: "10px 12px",
    borderRadius: 10,
    outline: "none"
  };

  return (
    <div style={{ padding: 20, color: "white" }}>
      <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 12 }}>
        <FileText size={20} style={{ marginRight: 8 }} />
        Générateur de factures
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ marginBottom: 6, opacity: 0.8 }}>Nom client</div>
          <input name="client_name" value={form.client_name} onChange={handleChange} style={inputStyle} />
        </div>

        <div>
          <div style={{ marginBottom: 6, opacity: 0.8 }}>Email client</div>
          <input name="client_email" value={form.client_email} onChange={handleChange} style={inputStyle} />
        </div>

        <div>
          <div style={{ marginBottom: 6, opacity: 0.8 }}>N° facture</div>
          <input name="invoice_number" value={form.invoice_number} onChange={handleChange} style={inputStyle} />
        </div>

        <div>
          <div style={{ marginBottom: 6, opacity: 0.8 }}>Montant</div>
          <input name="amount" type="number" value={form.amount} onChange={handleChange} style={inputStyle} />
        </div>

        <div style={{ gridColumn: "span 2" }}>
          <div style={{ marginBottom: 6, opacity: 0.8 }}>Description</div>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            style={{ ...inputStyle, minHeight: 90 }}
          />
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "#fca5a5", display: "flex", gap: 8, alignItems: "center" }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <button
        onClick={generateInvoice}
        disabled={loading}
        style={{
          marginTop: 14,
          background: loading ? "#374151" : "#10b981",
          border: "none",
          color: "white",
          padding: "10px 14px",
          borderRadius: 10,
          cursor: loading ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8
        }}
      >
        {loading ? <Loader2 size={16} /> : <Download size={16} />}
        {loading ? "Génération..." : "Générer le PDF"}
      </button>
    </div>
  );
};

export default InvoiceGenerator;