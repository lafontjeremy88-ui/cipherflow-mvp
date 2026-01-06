import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL, clearAuth } from "../services/api";

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 3 &&
      password.length >= 1 &&
      confirmPassword.length >= 1 &&
      !loading
    );
  }, [email, password, confirmPassword, loading]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const cleanEmail = email.trim().toLowerCase();

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
      clearAuth();

      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.detail || "Inscription impossible.");
        return;
      }

           // Sinon fallback : login manuel
      setSuccess("✅ Inscription enregistrée ! Redirection vers la connexion…");
      setTimeout(() => navigate("/login"), 5000);
    } catch (err) {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Créer un compte</h1>
        <p style={styles.subtitle}>Accède à ton espace CipherFlow.</p>

        {error ? (
          <div style={{ ...styles.alert, ...styles.alertError }}>{error}</div>
        ) : null}

        {success ? (
          <div style={{ ...styles.alert, ...styles.alertSuccess }}>{success}</div>
        ) : null}

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            placeholder="ton@email.com"
            value={email}
            onChange={(e) => setEmailInput(e.target.value)}
            autoComplete="email"
            required
          />

          <label style={styles.label}>Mot de passe</label>
          <input
            style={styles.input}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <label style={styles.label}>Confirmer le mot de passe</label>
          <input
            style={styles.input}
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <button
            type="submit"
            className="btn btn-primary"
            style={{ ...styles.button, opacity: canSubmit ? 1 : 0.6 }}
            disabled={!canSubmit}
          >
            {loading ? "Création..." : "S'inscrire"}
          </button>
        </form>

        <div style={styles.footer}>
          <span style={{ opacity: 0.8 }}>Déjà un compte ?</span>{" "}
          <Link to="/login" style={styles.link}>
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background:
      "radial-gradient(1200px 800px at 20% 10%, rgba(120, 90, 255, 0.18), transparent 60%), radial-gradient(1000px 700px at 80% 30%, rgba(100, 200, 255, 0.12), transparent 55%), linear-gradient(180deg, #0b1020, #070a12)",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 16,
    padding: 24,
    color: "#e9ecff",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 20px 70px rgba(0,0,0,0.35)",
    backdropFilter: "blur(10px)",
  },
  title: { margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: 0.2 },
  subtitle: { marginTop: 6, marginBottom: 18, opacity: 0.75 },
  alert: {
    borderRadius: 12,
    padding: "10px 12px",
    marginBottom: 12,
    fontSize: 14,
    border: "1px solid rgba(255,255,255,0.12)",
  },
  alertError: {
    background: "rgba(255, 70, 70, 0.12)",
    borderColor: "rgba(255, 70, 70, 0.25)",
  },
  alertSuccess: {
    background: "rgba(60, 220, 140, 0.12)",
    borderColor: "rgba(60, 220, 140, 0.25)",
  },
  form: { display: "grid", gap: 10 },
  label: { fontSize: 13, opacity: 0.9, marginTop: 4 },
  input: {
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    color: "#e9ecff",
    padding: "0 12px",
    outline: "none",
  },
  button: {
    height: 44,
    borderRadius: 12,
    marginTop: 10,
  },
  footer: {
    marginTop: 14,
    fontSize: 13,
    textAlign: "center",
  },
  link: {
    color: "#bfa9ff",
    textDecoration: "none",
    fontWeight: 700,
  },
};
