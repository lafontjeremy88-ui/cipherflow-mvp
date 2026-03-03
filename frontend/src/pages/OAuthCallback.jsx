import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../services/api";

const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

export default function OAuthCallback({ onSuccess }) {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    // NOUVELLE MÉTHODE SÉCURISÉE :
    // Au lieu de lire le cookie directement (impossible avec httponly=true),
    // on appelle un endpoint backend qui lit le cookie HttpOnly côté serveur
    // et nous retourne le token en JSON.
    
    const exchangeToken = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/google/exchange-token`, {
          method: 'GET',
          credentials: 'include',  // ✅ IMPORTANT : Envoie les cookies (dont oauth_token)
        });

        if (!response.ok) {
          // Pas de cookie trouvé ou erreur serveur
          console.error("Erreur échange token:", response.status);
          navigate("/", { replace: true });
          return;
        }

        const data = await response.json();
        const { token, email } = data;

        if (!token) {
          console.error("Token manquant dans la réponse");
          navigate("/", { replace: true });
          return;
        }

        // Stockage en localStorage (maintenant que le cookie HttpOnly est supprimé côté serveur)
        localStorage.setItem(LS_TOKEN, token);
        if (email) {
          localStorage.setItem(LS_EMAIL, email);
        }

        // Notifier App.jsx que la connexion est réussie
        if (typeof onSuccess === "function") {
          onSuccess(token, email);
        }

        // Redirection vers le dashboard
        navigate("/", { replace: true });
        
      } catch (err) {
        console.error("Erreur lors de l'échange du token:", err);
        setError("Erreur de connexion. Veuillez réessayer.");
        
        // Redirection après 2 secondes en cas d'erreur
        setTimeout(() => {
          navigate("/", { replace: true });
        }, 2000);
      }
    };

    exchangeToken();
  }, [navigate, onSuccess]);

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