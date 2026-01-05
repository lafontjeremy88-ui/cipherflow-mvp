import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import EmailHistory from "./components/EmailHistory";

// ⚠️ adapte ces imports si tes chemins/pages sont différents
import DocumentsPage from "./pages/DocumentsPage"; // si tu as une page docs
import InvoicesPage from "./pages/InvoicesPage";   // si tu as une page quittances
import SettingsPage from "./pages/SettingsPage";   // si tu as une page paramètres
import EmailProcessPage from "./pages/EmailProcessPage"; // traitement email
import TenantsPage from "./pages/TenantsPage";     // dossiers locataires

const API_URL = (import.meta?.env?.VITE_API_URL || "").replace(/\/$/, "");

const AuthCtx = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

function getTokens() {
  return {
    accessToken: localStorage.getItem("access_token") || "",
    refreshToken: localStorage.getItem("refresh_token") || "",
  };
}

function setTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem("access_token", accessToken);
  if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
}

function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

async function safeJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const { accessToken } = getTokens();
    setIsAuthed(Boolean(accessToken));
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setIsAuthed(false);
  }, []);

  const refreshAccessToken = useCallback(async () => {
    const { refreshToken } = getTokens();
    if (!refreshToken) return false;

    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return false;

    const data = await safeJson(res);
    const newAccess = data?.access_token || data?.accessToken || data?.token;
    if (!newAccess) return false;

    setTokens({ accessToken: newAccess });
    setIsAuthed(true);
    return true;
  }, []);

  const authFetch = useCallback(
    async (path, options = {}, _retry = false) => {
      if (!API_URL) throw new Error("VITE_API_URL est vide. Vérifie ton .env Vercel.");

      const { accessToken } = getTokens();

      const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: accessToken ? `Bearer ${accessToken}` : "",
        },
      });

      if (res.status !== 401) return res;

      // 401 => on tente refresh une fois
      if (_retry) return res;

      const ok = await refreshAccessToken();
      if (!ok) {
        logout();
        return res;
      }
      return authFetch(path, options, true);
    },
    [logout, refreshAccessToken]
  );

  const value = useMemo(
    () => ({
      ready,
      isAuthed,
      setIsAuthed,
      authFetch,
      logout,
    }),
    [ready, isAuthed, authFetch, logout]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function RequireAuth({ children }) {
  const { ready, isAuthed } = useAuth();
  const location = useLocation();

  if (!ready) return null;
  if (!isAuthed) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

// ⚠️ Login minimal (si tu as déjà une page Login, remplace par la tienne)
function LoginPage() {
  const { setIsAuthed } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        setErr("Connexion refusée.");
        return;
      }

      const data = await safeJson(res);
      const accessToken = data?.access_token || data?.accessToken || data?.token;
      const refreshToken = data?.refresh_token || data?.refreshToken;

      if (!accessToken) {
        setErr("Token manquant dans la réponse.");
        return;
      }

      setTokens({ accessToken, refreshToken });
      setIsAuthed(true);
      navigate(from, { replace: true });
    } catch (e2) {
      setErr("Erreur réseau.");
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: 420 }}>
        <h2 style={{ marginTop: 0 }}>Connexion</h2>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" type="password" />
          {err ? <div style={{ opacity: 0.9 }}>{err}</div> : null}
          <button type="submit">Se connecter</button>
        </form>
      </div>
    </div>
  );
}

function Sidebar() {
  const { logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">⚡</div>
        <div className="brand-name">CipherFlow V2</div>
      </div>

      <nav className="nav">
        <NavLink className="nav-link" to="/dashboard">Vue d&apos;ensemble</NavLink>
        <NavLink className="nav-link" to="/emails">Traitement Email</NavLink>
        <NavLink className="nav-link" to="/invoices">Quittances &amp; Loyers</NavLink>
        <NavLink className="nav-link" to="/tenants">Dossiers Locataires</NavLink>
        <NavLink className="nav-link" to="/docs">Analyse Docs</NavLink>
        <NavLink className="nav-link" to="/history">Historique</NavLink>
        <NavLink className="nav-link" to="/settings">Paramètres</NavLink>
      </nav>

      <div style={{ marginTop: "auto" }}>
        <button onClick={logout} className="btn-danger" style={{ width: "100%" }}>
          Déconnexion
        </button>
      </div>
    </aside>
  );
}

function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Historique (liste + détail) */}
          <Route path="/history" element={<EmailHistory />} />

          {/* Si tu as des pages existantes, garde-les. Sinon tu peux laisser des placeholders */}
          <Route path="/emails" element={<EmailProcessPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/tenants" element={<TenantsPage />} />
          <Route path="/docs" element={<DocumentsPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
