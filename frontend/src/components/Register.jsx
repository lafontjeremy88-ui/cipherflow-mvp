import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL, clearAuth } from "../services/api";

/**
 * Register
 * - Formulaire d'inscription email/mot de passe
 * - Appelle /auth/register (fetch direct)
 * - Affiche un message succès
 * - Redirige vers /login après 2 secondes
 */
export default function Register() {
  // Permet de naviguer programmétiquement (rediriger)
  const navigate = useNavigate();

  // Champs formulaire
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // États UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /**
   * canSubmit :
   * - calcule si le bouton "S'inscrire" doit être actif
   * - useMemo évite de recalculer inutilement
   */
  const canSubmit = useMemo(() => {
    const cleanEmail = email.trim().toLowerCase();
    return (
      cleanEmail.length > 3 &&
      cleanEmail.includes("@") &&
      password.length >= 1 &&
      confirmPassword.length >= 1 &&
      !loading
    );
  }, [email, password, confirmPassword, loading]);

  /**
   * handleSubmit :
   * - validation simple email + passwords match
   * - POST /auth/register
   * - affiche une erreur si backend refuse
   * - sinon message succès + redirection
   */
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const cleanEmail = email.trim().toLowerCase();

    // Validations basiques côté front
    if (!cleanEmail.includes("@")) {
      setError("Email invalide.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      setLoading(true);
      clearAuth(); // nettoie tokens éventuels

      // Appel direct du backend /auth/register
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      // Lecture JSON avec fallback si body vide
      const data = await res.json().catch(() => ({}));

      // Si backend renvoie une erreur (ex: email déjà pris)
      if (!res.ok) {
        setError(data?.detail || "Inscription impossible.");
        return;
      }

      // Succès
      setSuccess("✅ Inscription enregistrée ! Vérifie ton email puis connecte-toi.");

      // Redirection après 2s (laisse lire le message)
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">Créer un compte</h1>
        <p className="auth-subtitle">Accède à ton espace CipherFlow.</p>

        {/* Messages */}
        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              placeholder="ton@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Mot de passe</label>
            <input
              className="auth-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Confirmer le mot de passe</label>
            <input
              className="auth-input"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {/* Boutons */}
          <div className="auth-actions">
            <button className="auth-btn-primary" type="submit" disabled={!canSubmit}>
              {loading ? "Création..." : "S'inscrire"}
            </button>

            {/* Bouton style "secondary" mais route vers login */}
            <Link className="auth-btn-secondary" to="/login" style={{ textAlign: "center" }}>
              J’ai déjà un compte
            </Link>
          </div>
        </form>

        {/* Footer */}
        <div className="auth-links" style={{ justifyContent: "center", marginTop: 14 }}>
          <span style={{ color: "rgba(255,255,255,0.60)" }}>
            Déjà un compte ? <Link to="/login">Se connecter</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
