import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, setToken, setEmail } from "../services/api";

export default function OAuthCallback({ onDone }) {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const exchangeToken = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/google/exchange-token`, {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          console.error("Erreur échange token:", response.status);
          navigate("/login", { replace: true });
          return;
        }

        const data = await response.json();
        const { token, email } = data;

        if (!token) {
          console.error("Token manquant dans la réponse");
          navigate("/login", { replace: true });
          return;
        }

        // Stockage en mémoire (XSS-safe) — email en localStorage (non sensible)
        setToken(token);
        if (email) setEmail(email);

        if (typeof onDone === "function") {
          onDone();
        }
      } catch (err) {
        console.error("Erreur lors de l'échange du token:", err);
        setError("Erreur de connexion. Veuillez réessayer.");

        setTimeout(() => {
          navigate("/login", { replace: true });
        }, 2000);
      }
    };

    exchangeToken();
  }, [navigate, onDone]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ padding: 20, textAlign: "center" }}>
        {error ? (
          <>
            <h3 style={{ color: "#ef4444" }}>❌ {error}</h3>
            <p>Redirection...</p>
          </>
        ) : (
          <>
            <h3>🔐 Connexion sécurisée en cours...</h3>
            <p>Finalisation de l'authentification.</p>
          </>
        )}
      </div>
    </div>
  );
}
