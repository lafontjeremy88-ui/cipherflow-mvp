import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../services/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const canSubmit = useMemo(() => email.trim().length > 3 && !loading, [email, loading]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    try {
      setLoading(true);
      const data = await forgotPassword(email.trim().toLowerCase());

      // ✅ message neutre (même si email inexistant)
      setMsg(data?.message || "Si un compte existe, tu recevras un email de réinitialisation.");
    } catch (e2) {
      // ✅ neutre aussi (éviter d’indiquer “email inexistant”)
      setMsg("Si un compte existe, tu recevras un email de réinitialisation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">Mot de passe oublié</h1>
        <p className="auth-subtitle">
          Entre ton email. Si un compte existe, on t’envoie un lien de réinitialisation.
        </p>

        {err && <div className="auth-error">{err}</div>}
        {msg && (
          <div className="auth-success" style={{ marginBottom: 12 }}>
            {msg}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="ton@email.com"
              required
            />
          </div>

          <div className="auth-actions">
            <button className="auth-btn-primary" type="submit" disabled={!canSubmit}>
              {loading ? "Envoi..." : "Envoyer le lien"}
            </button>
          </div>

          <div className="auth-links" style={{ justifyContent: "center", marginTop: 14 }}>
            <Link to="/login">Retour connexion</Link>
          </div>
          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "13px", opacity: 0.8 }}
            >
              Politique de confidentialité
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
