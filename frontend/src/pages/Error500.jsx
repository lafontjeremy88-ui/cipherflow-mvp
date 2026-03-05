import React from "react";
import { useNavigate } from "react-router-dom";

export default function Error500() {
  const navigate = useNavigate();

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "var(--bg, #0f1117)",
      color: "var(--text, #e2e8f0)",
      textAlign: "center",
      padding: "2rem",
    }}>
      <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>⚠️</div>

      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.75rem" }}>
        Une erreur inattendue s'est produite
      </h1>

      <p style={{ fontSize: "1rem", opacity: 0.6, marginBottom: "0.5rem" }}>
        L'équipe a été notifiée automatiquement.
      </p>

      <p style={{ fontSize: "0.875rem", opacity: 0.45, marginBottom: "2rem" }}>
        Erreur 500 — Serveur
      </p>

      <button
        onClick={() => navigate("/dashboard")}
        style={{
          padding: "0.65rem 1.5rem",
          background: "var(--accent, #6366f1)",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontSize: "0.95rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Retour au dashboard
      </button>
    </div>
  );
}
