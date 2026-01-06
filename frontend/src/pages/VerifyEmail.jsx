import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Vérification en cours…");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("Lien invalide : token manquant.");
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setStatus("error");
          setMessage(data?.detail || "Vérification impossible.");
          return;
        }

        setStatus("success");
        setMessage(data?.message || "✅ Email confirmé. Redirection vers la connexion…");

        setTimeout(() => navigate("/login", { replace: true }), 4000);
      } catch (e) {
        setStatus("error");
        setMessage("Erreur réseau. Réessaie.");
      }
    })();
  }, [location.search, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Validation de l’email</h1>

        {status === "loading" && <div className="auth-alert info">{message}</div>}
        {status === "success" && <div className="auth-alert success">{message}</div>}
        {status === "error" && (
          <div className="auth-alert error">
            {message}
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => navigate("/login")}>
                Aller à la connexion
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
