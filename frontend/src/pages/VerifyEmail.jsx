import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { resendVerificationEmail } from "../services/api";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://cipherflow-mvp-production.up.railway.app";

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();

  const token = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return qs.get("token") || "";
  }, [location.search]);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("idle"); // idle | success | error
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setStatus("idle");
      setMessage("");
      setResendMsg("");

      if (!token) {
        setLoading(false);
        setStatus("error");
        setMessage("Lien invalide.");
        return;
      }

      try {
        // IMPORTANT: GET (pas POST)
        const url = `${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { method: "GET" });

        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          if (res.ok) {
            setStatus("success");
            setMessage(data.message || "Email vérifié avec succès ✅");
          } else {
            setStatus("error");
            setMessage(data.detail || data.message || "Lien invalide ou expiré.");
          }
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Erreur réseau. Réessaie.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onResend() {
    setResendMsg("");
    setResendLoading(true);
    try {
      const res = await resendVerificationEmail(email);
      setResendMsg(res?.message || "Si ce compte existe et n'est pas vérifié, un email a été renvoyé.");
    } catch (e) {
      setResendMsg("Impossible de renvoyer l'email pour le moment.");
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Validation de l’email</h1>

        {loading ? (
          <p>Vérification en cours...</p>
        ) : status === "success" ? (
          <>
            <p style={{ marginTop: 8 }}>{message}</p>
            <button style={{ marginTop: 16 }} onClick={() => navigate("/login")}>
              Aller à la connexion
            </button>
          </>
        ) : (
          <>
            <p style={{ marginTop: 8 }}>{message}</p>

            <button style={{ marginTop: 16 }} onClick={() => navigate("/login")}>
              Aller à la connexion
            </button>

            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 14, opacity: 0.9 }}>
                Ton lien ne fonctionne plus ? Tu peux renvoyer un email de confirmation.
              </p>

              <input
                style={{ marginTop: 10, width: "100%" }}
                type="email"
                placeholder="Ton email (ex: toi@gmail.com)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <button
                style={{ marginTop: 10 }}
                onClick={onResend}
                disabled={resendLoading || !email}
              >
                {resendLoading ? "Envoi..." : "Renvoyer l’email de confirmation"}
              </button>

              {resendMsg ? <p style={{ marginTop: 10 }}>{resendMsg}</p> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
