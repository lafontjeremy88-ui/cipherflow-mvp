import React, { useState } from "react";
import { Link } from "react-router-dom";
import { login, API_URL, clearAuth } from "../services/api";

export default function Login({ onLogin }) {
  const [email, setEmailState] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      clearAuth();

      // ✅ login() retourne déjà le JSON (api.js)
      const data = await login(email, password);

      const token = data?.access_token || data?.token || data?.accessToken;
      if (!token) {
        setError(data?.detail || "Token manquant dans la réponse /auth/login");
        return;
      }

      if (typeof onLogin === "function") onLogin();
    } catch (err) {
      setError(err?.message || "Erreur réseau");
      clearAuth();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    window.location.href = `${API_URL}/auth/google/login`;
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">CipherFlow V2</h1>
        <p className="auth-subtitle">Connexion à l’espace pro</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              value={email}
              onChange={(e) => setEmailState(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="admin@cipherflow.com"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Mot de passe</label>
            <input
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="auth-links">
            <Link to="/forgot-password">Mot de passe oublié ?</Link>
            <Link to="/register">Créer un compte</Link>
          </div>

          <div className="auth-actions">
            <button className="auth-btn-primary" type="submit" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            <button className="auth-btn-secondary" type="button" onClick={handleGoogle}>
              Continuer avec Google
            </button>
          </div>
        </form>

        <div className="auth-links" style={{ justifyContent: "center", marginTop: 14 }}>
          <span style={{ color: "rgba(255,255,255,0.60)" }}>
            Pas encore de compte ? <Link to="/register">Créer un compte gratuitement</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
