import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  Zap,
  PieChart,
  Mail,
  FileText,
  FolderSearch,
  FolderUp,
  History,
  Settings,
  LogOut,
  User,
} from "lucide-react";

import Login from "./components/Login";
import Register from "./components/Register";

import DashboardPage from "./pages/Dashboard";
import OAuthCallback from "./pages/OAuthCallback";

import EmailHistory from "./components/EmailHistory";
import InvoiceGenerator from "./components/InvoiceGenerator";
import TenantFilesPanel from "./components/TenantFilesPanel";
import FileAnalyzer from "./components/FileAnalyzer";
import SettingsPanel from "./components/SettingsPanel";

import "./App.css";

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";
const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

function getStoredToken() {
  return localStorage.getItem(LS_TOKEN);
}
function setStoredToken(t) {
  if (t) localStorage.setItem(LS_TOKEN, t);
}
function clearStoredAuth() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_EMAIL);
}

/**
 * Wrapper route pour compat:
 * - /emails/:emailId
 * - /history/:emailId
 *
 * => on renvoie EmailHistory avec un prop emailId
 * (EmailHistory devra l'utiliser si tu veux ouvrir automatiquement un mail)
 */
function EmailHistoryRoute({ token, authFetch }) {
  const { emailId } = useParams();
  return <EmailHistory token={token} authFetch={authFetch} emailId={emailId} />;
}

export default function App() {
  const [token, setToken] = useState(getStoredToken());
  const [userEmail, setUserEmail] = useState(localStorage.getItem(LS_EMAIL));
  const [showRegister, setShowRegister] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  /**
   * /auth/refresh via cookie HttpOnly (credentials include OBLIGATOIRE)
   * -> récupère un nouvel access token et le stocke
   */
  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) return null;

      const data = await res.json();
      const newAccess =
        data.access_token || data.token || data.accessToken || data.access || null;

      if (newAccess) {
        setStoredToken(newAccess);
        setToken(newAccess);
        return newAccess;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Boot SaaS : si pas de token => tente refresh (cookie)
   */
  useEffect(() => {
    (async () => {
      if (!getStoredToken()) {
        await refreshSession();
      }
      setBootLoading(false);
    })();
  }, [refreshSession]);

  const handleAuthSuccess = (newToken, email) => {
    setStoredToken(newToken);
    setToken(newToken);

    if (email) {
      localStorage.setItem(LS_EMAIL, email);
      setUserEmail(email);
    }
    setShowRegister(false);
  };

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    } finally {
      clearStoredAuth();
      setToken(null);
      setUserEmail(null);
      setShowRegister(false);
    }
  }, []);

  /**
   * authFetch PRO :
   * - Authorization Bearer
   * - si 401 => refresh => retry 1 fois
   * - si encore 401 => logout
   */
  const authFetch = useCallback(
    async (path, options = {}) => {
      const doRequest = async (accessToken) => {
        const headers = { ...(options.headers || {}) };

        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

        const isFormData = options.body instanceof FormData;
        if (!isFormData && !headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
        if (isFormData) {
          delete headers["Content-Type"];
          delete headers["content-type"];
        }

        return fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
          credentials: "include",
        });
      };

      let res = await doRequest(getStoredToken());

      if (res.status === 401) {
        const newAccess = await refreshSession();
        if (!newAccess) {
          await handleLogout();
          throw new Error("Session expirée, reconnecte-toi.");
        }

        setStoredToken(newAccess);
        setToken(newAccess);

        res = await doRequest(newAccess);

        if (res.status === 401) {
          await handleLogout();
          throw new Error("Session expirée, reconnecte-toi.");
        }
      }

      return res;
    },
    [refreshSession, handleLogout]
  );

  if (bootLoading) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1220",
          color: "white",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Zap size={40} color="#6366f1" />
        <div style={{ fontSize: "1.05rem", opacity: 0.9 }}>
          Chargement de la session…
        </div>
      </div>
    );
  }

  // Si pas connecté -> écran Login/Register (comme avant)
  if (!token) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#0b1220",
          padding: 20,
        }}
      >
        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <Zap size={44} color="#6366f1" />
          <h1 style={{ color: "white", fontSize: "1.6rem", marginTop: 10 }}>
            CipherFlow V2
          </h1>
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#111a2b",
            padding: "2rem",
            borderRadius: 16,
            boxShadow: "0 10px 25px rgba(0,0,0,.35)",
            border: "1px solid rgba(148,163,184,.12)",
          }}
        >
          {showRegister ? (
            <Register onLogin={handleAuthSuccess} />
          ) : (
            <Login onLogin={handleAuthSuccess} />
          )}

          <div
            style={{
              marginTop: "1.5rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid rgba(148,163,184,.18)",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#94a3b8", fontSize: "0.95rem", marginBottom: 10 }}>
              {showRegister ? "Déjà un compte ?" : "Pas encore de compte ?"}
            </p>

            <button
              onClick={() => setShowRegister((v) => !v)}
              style={{
                background: "rgba(99,102,241,.14)",
                color: "#c7d2fe",
                border: "1px solid rgba(99,102,241,.25)",
                padding: "10px 16px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 700,
                width: "100%",
              }}
            >
              {showRegister ? "Se connecter" : "Créer un compte gratuitement"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // App connectée
  return (
    <Routes>
      <Route
        path="/oauth/callback"
        element={<OAuthCallback onSuccess={handleAuthSuccess} />}
      />

      <Route
        path="/*"
        element={
          <AppLayout userEmail={userEmail} onLogout={handleLogout}>
            <AppRoutes authFetch={authFetch} token={token} />
          </AppLayout>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function AppRoutes({ authFetch, token }) {
  const navigate = useNavigate();

  // Helpers navigation Dashboard -> Historique / Email
  const onGoHistory = useCallback(
    (opts = {}) => {
      // opts peut contenir un filtre (ex: { filter: "urgent" })
      const qs =
        opts && opts.filter ? `?filter=${encodeURIComponent(opts.filter)}` : "";
      navigate(`/history${qs}`);
    },
    [navigate]
  );

  const onOpenEmail = useCallback(
    (emailId) => {
      if (!emailId) return navigate("/history");
      // Option A: route param
      // navigate(`/history/${encodeURIComponent(emailId)}`);

      // Option B: query param (souvent plus simple)
      navigate(`/history?open=${encodeURIComponent(emailId)}`);
    },
    [navigate]
  );

  return (
    <Routes>
      <Route
        path="/dashboard"
        element={
          <DashboardPage
            token={token}
            authFetch={authFetch}
            onGoHistory={onGoHistory}
            onOpenEmail={onOpenEmail}
          />
        }
      />

      {/* Traitement email */}
      <Route path="/emails" element={<EmailHistory token={token} authFetch={authFetch} />} />
      <Route path="/emails/:emailId" element={<EmailHistoryRoute token={token} authFetch={authFetch} />} />

      {/* Quittances */}
      <Route path="/invoices" element={<InvoiceGenerator token={token} authFetch={authFetch} />} />

      {/* Dossiers locataires */}
      <Route path="/tenants" element={<TenantFilesPanel authFetch={authFetch} apiBase={API_BASE} />} />

      {/* Analyse docs */}
      <Route path="/docs" element={<FileAnalyzer authFetch={authFetch} apiBase={API_BASE} />} />

      {/* Historique */}
      <Route path="/history" element={<EmailHistory token={token} authFetch={authFetch} />} />
      <Route path="/history/:emailId" element={<EmailHistoryRoute token={token} authFetch={authFetch} />} />

      {/* Settings */}
      <Route path="/settings" element={<SettingsPanel token={token} authFetch={authFetch} />} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function AppLayout({ userEmail, onLogout, children }) {
  const location = useLocation();

  const navItems = useMemo(
    () => [
      { to: "/dashboard", label: "Vue d'ensemble", icon: <PieChart size={20} /> },
      { to: "/emails", label: "Traitement Email", icon: <Mail size={20} /> },
      { to: "/invoices", label: "Quittances & Loyers", icon: <FileText size={20} /> },
      { to: "/tenants", label: "Dossiers Locataires", icon: <FolderSearch size={20} /> },
      { to: "/docs", label: "Analyse Docs", icon: <FolderUp size={20} /> },
      { to: "/history", label: "Historique", icon: <History size={20} /> },
      { to: "/settings", label: "Paramètres", icon: <Settings size={20} /> },
    ],
    []
  );

  const pageTitle = useMemo(() => {
    const hit = navItems.find((x) => location.pathname.startsWith(x.to));
    return hit?.label || "CipherFlow";
  }, [location.pathname, navItems]);

  // Important: sur /dashboard, ton composant Dashboard affiche déjà un gros titre.
  // Donc on masque le header global pour éviter "Vue d'ensemble" en double.
  const showGlobalHeader = useMemo(() => {
    return !location.pathname.startsWith("/dashboard");
  }, [location.pathname]);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo">
          <Zap size={28} color="#6366f1" />
          <span>CipherFlow V2</span>
        </div>

        {/* Bloc user */}
        <div
          style={{
            padding: "0 20px 20px 20px",
            marginBottom: 18,
            borderBottom: "1px solid rgba(148,163,184,.18)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                background: "rgba(148,163,184,.10)",
                padding: 10,
                borderRadius: "50%",
                border: "1px solid rgba(148,163,184,.18)",
              }}
            >
              <User size={16} />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: "white" }}>Connecté</div>
              <div
                title={userEmail || ""}
                style={{
                  fontSize: ".85rem",
                  color: "#94a3b8",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 170,
                }}
              >
                {userEmail || "—"}
              </div>
            </div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              {item.icon} <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Logout en bas */}
          <button
            type="button"
            className="nav-item"
            style={{
              marginTop: "auto",
              color: "#f87171",
              background: "transparent",
              border: "none",
              textAlign: "left",
            }}
            onClick={onLogout}
          >
            <LogOut size={20} /> <span>Déconnexion</span>
          </button>
        </nav>
      </aside>

      <main className="main-content">
        {/* Wrapper pour éviter pages trop étroites */}
        <div style={{ width: "100%", maxWidth: 1400, margin: "0 auto" }}>
          {showGlobalHeader && (
            <header style={{ marginBottom: "1.6rem" }}>
              <h1 style={{ fontSize: "2rem", fontWeight: 900 }}>{pageTitle}</h1>
            </header>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}
