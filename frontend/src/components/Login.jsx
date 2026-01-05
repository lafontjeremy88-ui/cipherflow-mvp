import React, { useState } from "react";
import { Lock, Mail, ArrowRight, Zap } from "lucide-react";
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
      // IMPORTANT : on utilise la fonction login() de services/api.js
      // Elle gère apiPublicFetch + setToken + setEmail
      const data = await login(email, password);

      const token = data?.access_token || data?.token || data?.accessToken;
      if (!token) {
        setError(data?.detail || "Token manquant (login incomplet)");
        setLoading(false);
        return;
      }

      // Préviens App.jsx que le login est OK
      if (typeof onLogin === "function") onLogin();
    } catch (err) {
      const msg =
        err?.message ||
        err?.detail ||
        "Erreur de connexion (vérifie email / mot de passe)";
      setError(msg);
      clearAuth();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    // Démarre l’OAuth côté backend
    window.location.href = `${API_URL}/auth/google/login`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#0B1020] text-white">
      <div className="w-full max-w-md bg-[#121A2F] rounded-2xl p-8 shadow-lg border border-white/10">
        <div className="flex items-center gap-2 mb-6">
          <Zap className="text-purple-400" />
          <h1 className="text-2xl font-bold">CipherFlow</h1>
        </div>

        <p className="text-white/70 mb-6">Connexion à l’espace pro</p>

        {error && (
          <div className="bg-red-500/15 border border-red-500/30 text-red-200 p-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-white/70">Email</label>
            <div className="flex items-center gap-2 mt-1 bg-black/20 rounded-xl px-3 py-2 border border-white/10">
              <Mail className="w-4 h-4 text-white/60" />
              <input
                className="bg-transparent w-full outline-none"
                value={email}
                onChange={(e) => setEmailState(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="toi@agence.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-white/70">Mot de passe</label>
            <div className="flex items-center gap-2 mt-1 bg-black/20 rounded-xl px-3 py-2 border border-white/10">
              <Lock className="w-4 h-4 text-white/60" />
              <input
                className="bg-transparent w-full outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 transition rounded-xl py-3 font-semibold disabled:opacity-60"
          >
            {loading ? "Connexion..." : "Se connecter"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="my-5 border-t border-white/10" />

        <button
          type="button"
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 transition rounded-xl py-3 font-semibold"
        >
          Continuer avec Google
        </button>

        <p className="text-xs text-white/50 mt-4">
          Astuce : si ça boucle, vide le storage (localStorage) et reconnecte-toi.
        </p>
      </div>
    </div>
  );
}
