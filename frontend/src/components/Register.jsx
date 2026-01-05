import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, UserPlus, AlertCircle } from "lucide-react";

import { apiPublicFetch, setStoredToken, setStoredEmail } from "../services/api";

function passwordIssues(pw) {
  const issues = [];
  if (!pw || pw.length < 8) issues.push("Au moins 8 caractères");
  if (!/[a-z]/.test(pw)) issues.push("Au moins 1 minuscule");
  if (!/[A-Z]/.test(pw)) issues.push("Au moins 1 majuscule");
  if (!/[0-9]/.test(pw)) issues.push("Au moins 1 chiffre");
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push("Au moins 1 caractère spécial");
  return issues;
}

export default function Register() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");

  const issues = useMemo(() => passwordIssues(password), [password]);
  const passwordsMatch = password && confirm && password === confirm;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) return setError("Email requis.");
    if (!password) return setError("Mot de passe requis.");
    if (issues.length) return setError("Mot de passe trop faible.");
    if (password !== confirm) return setError("Les mots de passe ne correspondent pas.");

    try {
      setBusy(true);

      const res = await apiPublicFetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // backend renvoie souvent {detail: "..."}
        const msg = data?.detail || "Inscription impossible.";
        setError(msg);
        return;
      }

      // Si ton backend renvoie directement un token après register :
      if (data?.access_token) {
        setStoredToken(data.access_token);
        setStoredEmail(data.user_email || cleanEmail);
        setSuccess("Compte créé. Connexion en cours…");
        nav("/dashboard");
        return;
      }

      // Sinon, on redirige vers login
      setSuccess("Compte créé. Tu peux te connecter.");
      nav("/login");
    } catch (err) {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#05060a] via-[#0b1020] to-[#05060a] p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-white/90" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Créer un compte</h1>
              <p className="text-sm text-white/60">Accède à ton espace CipherFlow.</p>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          {success ? (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {success}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-white/70">Email</span>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 focus-within:border-white/25">
                <Mail className="h-4 w-4 text-white/50" />
                <input
                  className="w-full bg-transparent outline-none text-white placeholder:text-white/30"
                  type="email"
                  placeholder="nom@domaine.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm text-white/70">Mot de passe</span>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 focus-within:border-white/25">
                <Lock className="h-4 w-4 text-white/50" />
                <input
                  className="w-full bg-transparent outline-none text-white placeholder:text-white/30"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="mt-2 text-xs text-white/50">
                {issues.length ? (
                  <ul className="list-disc ml-4 space-y-1">
                    {issues.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-emerald-300/80">Mot de passe OK ✅</span>
                )}
              </div>
            </label>

            <label className="block">
              <span className="text-sm text-white/70">Confirmer le mot de passe</span>
              <div
                className={[
                  "mt-2 flex items-center gap-2 rounded-xl border bg-black/20 px-3 py-2 focus-within:border-white/25",
                  confirm.length === 0
                    ? "border-white/10"
                    : passwordsMatch
                    ? "border-emerald-500/30"
                    : "border-red-500/30",
                ].join(" ")}
              >
                <Lock className="h-4 w-4 text-white/50" />
                <input
                  className="w-full bg-transparent outline-none text-white placeholder:text-white/30"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {confirm.length > 0 && !passwordsMatch ? (
                <div className="mt-2 text-xs text-red-200/90">Les mots de passe ne correspondent pas.</div>
              ) : null}
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 transition"
            >
              {busy ? "Création…" : "S'inscrire"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-white/60">
            Déjà un compte ?{" "}
            <Link to="/login" className="text-white hover:underline">
              Se connecter
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
