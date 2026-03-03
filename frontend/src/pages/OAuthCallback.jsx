import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../services/api";

const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

export default function OAuthCallback({ onDone }) {  // ← CORRIGÉ : onDone au lieu de onSuccess
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    // Méthode sécurisée avec endpoint d'échange
    const exchangeToken = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/google/exchange-token`, {
          method: 'GET',
          credentials: 'include',  // Envoie les cookies
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

        // Stockage en localStorage
        localStorage.setItem(LS_TOKEN, token);
        if (email) {
          localStorage.setItem(LS_EMAIL, email);
        }

        // ✅ IMPORTANT : Appeler onDone (pas onSuccess)
        if (typeof onDone === "function") {
          onDone();
        }

        // La navigation est gérée par handleLoginSuccess dans App.jsx
        
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