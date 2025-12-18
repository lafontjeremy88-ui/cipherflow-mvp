import React, { useEffect, useState } from 'react';
import { apiFetch } from "../services/api";
import { Mail, ArrowLeft, X } from 'lucide-react';

const EmailHistory = ({ token, initialId }) => {
  const [history, setHistory] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiFetch("/email/history");
        if (res?.ok) {
          const data = await res.json();
          setHistory(data);

          if (initialId) {
            const found = data.find(item => item.id === initialId);
            if (found) setSelectedEmail(found);
          }
        }
      } catch (e) {
        console.error("Erreur history", e);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [initialId]);

  if (loading) return <div style={{ padding: 20 }}>Chargement...</div>;

  return (
    <div style={{ padding: 20, color: "white" }}>
      <h2 style={{ fontSize: 24, fontWeight: 900, marginBottom: 10 }}>
        <Mail size={20} style={{ marginRight: 8 }} />
        Historique Emails
      </h2>

      {!selectedEmail ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {history.length === 0 && <div style={{ opacity: 0.8 }}>Aucun email dans l’historique.</div>}

          {history.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedEmail(item)}
              style={{
                background: "#1f2937",
                color: "white",
                border: "none",
                padding: 12,
                borderRadius: 10,
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <div style={{ fontWeight: 800 }}>{item.subject || "Sans sujet"}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{item.from_email || ""}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{item.created_at || ""}</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ background: "#111827", padding: 16, borderRadius: 12 }}>
          <button
            onClick={() => setSelectedEmail(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              marginBottom: 10
            }}
          >
            <ArrowLeft size={18} /> Retour
          </button>

          <h3 style={{ fontSize: 18, fontWeight: 900 }}>{selectedEmail.subject || "Sans sujet"}</h3>
          <div style={{ opacity: 0.8, marginBottom: 10 }}>{selectedEmail.from_email || ""}</div>

          <div style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>
            {selectedEmail.body || selectedEmail.snippet || ""}
          </div>

          <button
            onClick={() => setSelectedEmail(null)}
            style={{
              marginTop: 12,
              background: "#ef4444",
              border: "none",
              color: "white",
              padding: "10px 14px",
              borderRadius: 10,
              cursor: "pointer"
            }}
          >
            <X size={16} style={{ marginRight: 6 }} />
            Fermer
          </button>
        </div>
      )}
    </div>
  );
};

export default EmailHistory;
