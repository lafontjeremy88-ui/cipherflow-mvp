import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  "https://cipherflow-mvp-production.up.railway.app";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function VerifyEmail() {
  const query = useQuery();
  const navigate = useNavigate();

  const token = query.get("token");

  const [status, setStatus] = useState("loading"); // loading | success | error
  const [message, setMessage] = useState("Vérification de ton email…");
  const [showResend, setShowResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Lien invalide : token manquant.");
      setShowResend(true);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`
        );

        if (res.ok) {
          setStatus("success");
          setMessage("Email confirmé. Tu peux maintenant te connecter.");
          setShowResend(false);
        } else {
          let data = null;
          try {
            data = await res.json();
          } catch (_) {}

          setStatus("error");
          setMessage(
            data?.detail ||
              "Échec de la vérification. Le lien est peut-être expiré."
          );
          setShowResend(true);
        }
      } catch (e) {
        setStatus("error");
        setMessage("Erreur réseau. Réessaie dans un instant.");
        setShowResend(true);
      }
    })();
  }, [token]);

  const onResend = async () => {
    if (!resendEmail?.trim()) return;

    setResendLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });

      if (res.ok) {
        setMessage("Email renvoyé. Vérifie ta boîte mail.");
        setStatus("success");
        setShowResend(false);
      } else {
        let data = null;
        try {
          data = await res.json();
        } catch (_) {}
        setMessage(data?.detail || "Impossible de renvoyer l’email.");
        setStatus("error");
      }
    } catch (e) {
      setMessage("Erreur réseau. Impossible de renvoyer l’email.");
      setStatus("error");
    } finally {
      setResendLoading(false);
    }
  };

  // ✅ Styles “dans l’esprit CipherFlow” : plein écran, centré, dark gradient, card glassy
  const pageStyle = {
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(124,58,237,.28), transparent 60%), radial-gradient(1000px 500px at 80% 20%, rgba(16,185,129,.18), transparent 55%), linear-gradient(180deg, #050816 0%, #060A1A 35%, #070B18 100%)",
  };

  const cardStyle = {
    width: "min(520px, 92vw)",
    borderRadius: "18px",
    padding: "26px",
    border: "1px solid rgba(255,255,255,.08)",
    background: "rgba(255,255,255,.04)",
    boxShadow: "0 10px 40px rgba(0,0,0,.35)",
    backdropFilter: "blur(10px)",
    color: "rgba(255,255,255,.92)",
  };

  const titleStyle = {
    fontSize: "26px",
    fontWeight: 800,
    marginBottom: "10px",
  };

  const textStyle = {
    fontSize: "14px",
    lineHeight: 1.5,
    color: "rgba(255,255,255,.80)",
    marginBottom: "18px",
  };

  const badgeStyle = (ok) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: `1px solid ${ok ? "rgba(16,185,129,.35)" : "rgba(239,68,68,.35)"}`,
    background: ok ? "rgba(16,185,129,.10)" : "rgba(239,68,68,.10)",
    marginBottom: "18px",
    fontSize: "14px",
  });

  const btnPrimary = {
    width: "100%",
    border: "none",
    borderRadius: "12px",
    padding: "12px 14px",
    fontWeight: 700,
    cursor: "pointer",
    background: "linear-gradient(90deg, rgba(124,58,237,1), rgba(147,51,234,1))",
    color: "white",
    boxShadow: "0 10px 26px rgba(124,58,237,.25)",
  };

  const btnGhost = {
    width: "100%",
    marginTop: "10px",
    borderRadius: "12px",
    padding: "12px 14px",
    fontWeight: 700,
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.03)",
    color: "rgba(255,255,255,.90)",
  };

  const inputStyle = {
    width: "100%",
    borderRadius: "12px",
    padding: "12px 14px",
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.25)",
    color: "rgba(255,255,255,.92)",
    outline: "none",
    marginTop: "10px",
  };

  const ok = status === "success";
  const isLoading = status === "loading";

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={titleStyle}>Validation de l’email</div>

        <div style={textStyle}>
          {isLoading
            ? "On finalise la vérification…"
            : "Si tout est bon, tu peux revenir à la connexion."}
        </div>

        {!isLoading && (
          <div style={badgeStyle(ok)}>
            <span style={{ fontSize: 16 }}>{ok ? "✅" : "❌"}</span>
            <span>{message}</span>
          </div>
        )}

        {isLoading && (
          <div style={badgeStyle(true)}>
            <span style={{ fontSize: 16 }}>⏳</span>
            <span>{message}</span>
          </div>
        )}

        <button style={btnPrimary} onClick={() => navigate("/login")}>
          Aller à la connexion
        </button>

        {showResend && (
          <>
            <input
              style={inputStyle}
              type="email"
              placeholder="Ton email (pour renvoyer le lien)"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
            />
            <button
              style={btnGhost}
              onClick={onResend}
              disabled={resendLoading}
              title="Renvoyer l’email de vérification"
            >
              {resendLoading ? "Envoi…" : "Renvoyer le lien"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
