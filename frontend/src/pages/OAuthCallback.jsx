import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

export default function OAuthCallback({ onSuccess }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    const token = params.get("token");
    const email = params.get("email"); // backend peut envoyer email

    if (!token) {
      navigate("/", { replace: true });
      return;
    }

    localStorage.setItem(LS_TOKEN, token);
    if (email) localStorage.setItem(LS_EMAIL, email);

    if (typeof onSuccess === "function") {
      onSuccess(token, email);
    }

    // Nettoyage + retour app
    navigate("/", { replace: true });
  }, [location.search, navigate, onSuccess]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ padding: 20 }}>
        <h3>Connexion en cours...</h3>
        <p>On finalise la session.</p>
      </div>
    </div>
  );
}
