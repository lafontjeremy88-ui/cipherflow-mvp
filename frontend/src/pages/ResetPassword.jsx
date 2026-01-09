import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { resetPassword } from "../services/api";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function ResetPassword() {
  const query = useQuery();
  const navigate = useNavigate();

  const token = query.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const canSubmit = useMemo(() => {
    return token && password.length >= 8 && password === confirm && !loading;
  }, [token, password, confirm, loading]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!token) {
      setErr("Lien invalide : token manquant.");
      return;
    }
    if (password !== confirm) {
      setErr("Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      setLoading(true);
      const data = await resetPassword(token, password);
      setMsg(data?.message || "Mot de passe réinitialisé.");

      setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (e2) {
      setErr(e2?.message || "Lien invalide ou expiré.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">Nouveau mot de passe</h1>
        <p className="auth-subtitle">Choisis un nouveau mot de passe (lien à usage unique).</p>

        {err && <div className="auth-error">{err}</div>}
        {msg && (
          <div className="auth-success" style={{ marginBottom: 12 }}>
            {msg}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="auth-field">
            <label className="auth-label">Nouveau mot de passe</label>
            <input
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Confirmer</label>
            <input
              className="auth-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="auth-actions">
            <button className="auth-btn-primary" type="submit" disabled={!canSubmit}>
              {loading ? "Validation..." : "Réinitialiser"}
            </button>
          </div>

          <div className="auth-links" style={{ justifyContent: "center", marginTop: 14 }}>
            <Link to="/login">Retour connexion</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
