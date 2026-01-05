import React, { useState } from "react";
import { Link } from "react-router-dom";
import { apiPublicFetch, setToken, setEmail, clearAuth } from "../services/api";

export default function Register({ onLogin }) {
  const [email, setEmailState] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }

    setLoading(true);
    try {
      clearAuth();
      const data = await apiPublicFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      const token = data?.access_token || data?.token || data?.accessToken || null;
      if (token) setToken(token);
      setEmail(data?.user_email || data?.email || email);

      if (typeof onLogin === "function") onLogin();
    } catch (err) {
      setError(err?.message || "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">Créer un compte</h1>
        <p className="auth-subtitle">Accède à ton espace CipherFlow.</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              value={email}
              onChange={(e) => setEmailState(e.target.value)}
              type="email"
              required
              autoComplete="email"
              placeholder="nom@entreprise.com"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Mot de passe</label>
            <input
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Confirmer le mot de passe</label>
            <input
              className="auth-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          <div className="auth-actions">
            <button className="auth-btn-primary" disabled={loading} type="submit">
              {loading ? "Création..." : "S'inscrire"}
            </button>
          </div>

          <div className="auth-links" style={{ justifyContent: "center" }}>
            <span>
              Déjà un compte ? <Link to="/login">Se connecter</Link>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
