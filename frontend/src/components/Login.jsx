import React, { useState } from "react";
import { Lock, Mail, ArrowRight, Zap } from "lucide-react";
import { apiPublicFetch, setToken, setEmail, clearAuth } from "../services/api";

const Login = ({ onLogin }) => {
  const [email, setEmailState] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      clearAuth(); // on repart propre

      const res = await apiPublicFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.detail || "Erreur de connexion");
        setLoading(false);
        return;
      }

      // access token (stocké local)
      setToken(data.access_token);

      // email (optionnel)
      const userEmail = data.user_email || email;
      setEmail(userEmail);

      // remonte au parent
      onLogin(data.access_token, userEmail);
    } catch (err) {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
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
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200">
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
                required
                placeholder="admin@cipherflow.com"
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
                required
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 transition rounded-xl py-3 font-semibold disabled:opacity-50"
            type="submit"
          >
            {loading ? "Connexion..." : "Se connecter"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
