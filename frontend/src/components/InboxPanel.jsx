import React, { useState } from "react";
import { RefreshCw, ArrowRight, Mail, AlertCircle } from "lucide-react";

const API_BASE = "https://cipherflow-mvp-production.up.railway.app"; // ⚠️ Mets ici ton URL d'API (ex: "http://localhost:8000")

const InboxPanel = ({ token, onSelectEmail }) => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchEmails = async () => {
    if (!token) {
      setError("Token manquant, merci de vous reconnecter.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/inbox/refresh`, {
        method: "GET", // ou "POST" selon ton backend
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Erreur serveur (${res.status})`);
      }

      const data = await res.json();
      // On essaie de s'adapter à plusieurs formats possibles
      const list = Array.isArray(data) ? data : data.emails || [];
      setEmails(list);
    } catch (err) {
      console.error(err);
      setError(
        err.message || "Erreur lors du rafraîchissement de la boîte mail."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "1000px" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: "2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "1.5rem",
              marginBottom: "0.5rem",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <Mail color="#6366f1" />
            Boîte de Réception
          </h2>
          <p style={{ color: "#94a3b8" }}>
            Connecté à : cipherflow.services@gmail.com
          </p>
        </div>

        <button
          onClick={fetchEmails}
          disabled={loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "0.5rem 1rem",
            borderRadius: "999px",
            border: "none",
            backgroundColor: "#6366f1",
            color: "white",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          <RefreshCw size={18} className={loading ? "spin" : ""} />
          {loading ? "Rafraîchissement..." : "Rafraîchir"}
        </button>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            backgroundColor: "#fee2e2",
            color: "#b91c1c",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Message vide */}
      {emails.length === 0 && !loading && !error && (
        <p style={{ color: "#64748b" }}>
          Aucun email chargé pour le moment. Clique sur « Rafraîchir ».
        </p>
      )}

      {/* Liste des emails */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {emails.map((email) => (
          <button
            key={email.id || email.message_id}
            onClick={() => onSelectEmail && onSelectEmail(email)}
            style={{
              textAlign: "left",
              padding: "0.75rem 1rem",
              borderRadius: "0.75rem",
              border: "1px solid #e2e8f0",
              backgroundColor: "white",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: "0.25rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "520px",
                }}
              >
                {email.subject || "(Sans objet)"}
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#64748b",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "520px",
                }}
              >
                {(email.from || email.sender || "Expéditeur inconnu") +
                  " — " +
                  (email.snippet || email.preview || "")}
              </div>
            </div>
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
    </div>
  );
};

export default InboxPanel;
