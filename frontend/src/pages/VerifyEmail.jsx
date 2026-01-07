import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState("loading"); // loading | success | error
  const [message, setMessage] = useState("Vérification en cours…");

  // resend UI
  const [showResend, setShowResend] = useState(false);
  const [email, setEmail] = useState("");
  const [resendStatus, setResendStatus] = useState(""); // message renvoi
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("Lien invalide : token manquant.");
      setShowResend(true);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        const data = await res.json().catch(() => ({}));
        const detail = data?.detail || data?.message || "Lien invalide ou expiré.";

        if (!res.ok) {
          setStatus("error");
          setMessage(detail);

          // Quand c'est expiré/invalide/déjà utilisé -> on propose le renvoi
          // (même si le message exact change, on reste utile)
          setShowResend(true);
          return;
        }

        setStatus("success");
        setMessage(data?.message || "Email validé ✅ Tu peux te connecter.");
        setShowResend(false);
      } catch (e) {
        setStatus("error");
        setMessage("Erreur réseau. Réessaie.");
        setShowResend(true);
      }
    })();
  }, [location.search]);

  async function handleResend() {
    if (!email.trim()) {
      setResendStatus("⚠️ Entre ton email pour renvoyer la confirmation.");
      return;
    }

    setResendLoading(true);
    setResendStatus("");

    try {
      const res = await fetch(`${API_BASE}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      const detail = data?.detail || data?.message || "Email renvoyé si le compte existe.";

      if (!res.ok) {
        setResendStatus(detail || "❌ Impossible de renvoyer l’email.");
        return;
      }

      setResendStatus(detail || "✅ Email renvoyé. Vérifie ta boîte.");
    } catch (e) {
      setResendStatus("❌ Erreur réseau. Réessaie.");
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Validation de l’email</h1>

        {status === "loading" && (
          <div className="auth-alert info">{message}</div>
        )}

        {status === "success" && (
          <>
            <div className="auth-alert success">{message}</div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => navigate("/login")}>
                Aller à la connexion
              </button>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="auth-alert error">{message}</div>

            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => navigate("/login")}>
                Aller à la connexion
              </button>
            </div>

            {showResend && (
              <div style={{ marginTop: 16 }}>
                <div className="auth-alert info">
                  Ton lien ne fonctionne plus ? Tu peux renvoyer un email de confirmation.
                </div>

                <div style={{ marginTop: 12 }}>
                  <input
                    className="auth-input"
                    type="email"
                    placeholder="Ton email (ex: toi@gmail.com)"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={handleResend}
                    disabled={resendLoading}
                  >
                    {resendLoading ? "Envoi en cours…" : "Renvoyer l’email de confirmation"}
                  </button>
                </div>

                {resendStatus && (
                  <div style={{ marginTop: 12 }} className="auth-alert info">
                    {resendStatus}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
