import React, { useState } from "react";
import { Link } from "react-router-dom";
import { login, API_URL, clearAuth } from "../services/api";

/**
 * Login
 * - Formulaire de connexion email/mot de passe
 * - Appelle login() (dans services/api.js)
 * - Stocke le token dans localStorage
 * - Appelle onLogin() pour que App.jsx redirige vers le dashboard
 */
export default function Login({ onLogin }) {
  // Champs du formulaire
  const [email, setEmailState] = useState("");
  const [password, setPassword] = useState("");

  // États UI
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * Soumission du formulaire
   * - clearAuth() : nettoie token/email existants
   * - login(email,password) : appelle /auth/login
   * - récupère un token dans la réponse
   * - stocke token + email
   * - déclenche onLogin()
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Nettoie l'état auth avant de se reconnecter
      clearAuth();

      // ✅ login() retourne déjà le JSON (api.js)
      const data = await login(email, password);

      // Supporte plusieurs formats possibles de réponse
      const token = data?.access_token || data?.token || data?.accessToken;
      if (!token) {
        setError(data?.detail || "Token manquant dans la réponse /auth/login");
        return;
      }

      // Stocke token + email en localStorage
      localStorage.setItem("cipherflow_token", token);
      localStorage.setItem("cipherflow_email", email.trim().toLowerCase());

      // Notifie App.jsx : "connecté"
      if (typeof onLogin === "function") onLogin();
    } catch (err) {
      // Erreur API / réseau
      setError(err?.message || "Erreur réseau");
      clearAuth();
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">CipherFlow V2</h1>
        <p className="auth-subtitle">Connexion à l’espace pro</p>

        {/* Message d'erreur */}
        {error && <div className="auth-error">{error}</div>}

        {/* Formulaire */}
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

          {/* Liens secondaires */}
          <div className="auth-links">
            <Link to="/forgot-password">Mot de passe oublié ?</Link>
            <Link to="/register">Créer un compte</Link>
          </div>

          {/* Actions */}
          <div className="auth-actions">
            <button className="auth-btn-primary" type="submit" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </button>

          </div>
        </form>

        {/* Footer */}
        <div className="auth-links" style={{ justifyContent: "center", marginTop: 14 }}>
          <span style={{ color: "rgba(255,255,255,0.60)" }}>
            Pas encore de compte ? <Link to="/register">Créer un compte gratuitement</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
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