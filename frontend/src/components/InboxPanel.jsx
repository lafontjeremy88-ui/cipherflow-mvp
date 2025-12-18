import React, { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { RefreshCw, Loader2, Inbox, Mail, AlertCircle } from "lucide-react";

const InboxPanel = ({ token }) => {
  const [loading, setLoading] = useState(false);
  const [emails, setEmails] = useState([]);
  const [error, setError] = useState("");

  const refreshInbox = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await apiFetch("/inbox/refresh", { method: "GET" });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Erreur refresh inbox");
      }

      const data = await res.json();
      setEmails(data || []);
    } catch (e) {
      console.error(e);
      setError(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Optionnel : auto-refresh au chargement
    // refreshInbox();
  }, []);

  return (
    <div style={{ padding: 20, color: "white" }}>
      <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 12 }}>
        <Inbox size={20} style={{ marginRight: 8 }} />
        Inbox
      </h2>

      <button
        onClick={refreshInbox}
        disabled={loading}
        style={{
          background: loading ? "#374151" : "#3b82f6",
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
        {loading ? <Loader2 size={16} /> : <RefreshCw size={16} />}
        {loading ? "Actualisation..." : "Rafraîchir"}
      </button>

      {error && (
        <div style={{ marginTop: 12, color: "#fca5a5", display: "flex", gap: 8, alignItems: "center" }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {emails.length === 0 && <div style={{ opacity: 0.8 }}>Aucun email.</div>}

        {emails.map((m) => (
          <div key={m.id} style={{ background: "#111827", padding: 14, borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Mail size={16} />
              <div style={{ fontWeight: 900 }}>{m.subject || "Sans sujet"}</div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{m.from_email || ""}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{m.date || m.created_at || ""}</div>
            {m.snippet && <div style={{ marginTop: 8, opacity: 0.9 }}>{m.snippet}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default InboxPanel;
