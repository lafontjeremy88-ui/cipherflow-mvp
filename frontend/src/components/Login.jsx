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

      // setToken() + setEmail() déjà appelés dans login() (services/api.js)
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

        {/* Séparateur */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          margin: '24px 0',
          gap: '12px'
        }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>ou</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
        </div>

        {/* Bouton Google OAuth */}
        <button
          type="button"
          onClick={() => window.location.href = `${API_URL}/auth/google/login`}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: '#fff',
            color: '#1f2937',
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!loading) e.target.style.backgroundColor = '#f9fafb';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#fff';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" fillRule="evenodd">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
              <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
            </g>
          </svg>
          Se connecter avec Google
        </button>

        {/* Footer */}
        <div className="auth-links" style={{ justifyContent: "center", marginTop: 14 }}>
          <span style={{ color: "rgba(255,255,255,0.60)" }}>
            Pas encore de compte ? <Link to="/register">Créer un compte gratuitement</Link>
          </span>
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
      </div>
    </div>
  );
}