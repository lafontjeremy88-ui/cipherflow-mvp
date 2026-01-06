import React, { useEffect, useMemo, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  useNavigate,
  useLocation,
} from "react-router-dom";

// Pages
import Dashboard from "./pages/Dashboard";
import OAuthCallback from "./pages/OAuthCallback";

// Components / Modules
import Login from "./components/Login";
import Register from "./components/Register";
import EmailHistory from "./components/EmailHistory";
import FileAnalyzer from "./components/FileAnalyzer";
import InvoiceGenerator from "./components/InvoiceGenerator";
import SettingsPanel from "./components/SettingsPanel";
import TenantFilesPanel from "./components/TenantFilesPanel";
import VerifyEmail from "./pages/VerifyEmail";

// ✅ NOUVEL ONGLET : Analyse Email
import EmailProcessor from "./pages/EmailProcessor";

// -----------------------------
// Config
// -----------------------------
const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

// ✅ une seule clé de token (stable)
const LS_ACCESS = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

function getStoredAccessToken() {
  return localStorage.getItem(LS_ACCESS);
}

function setStoredAccessToken(token) {
  if (token) localStorage.setItem(LS_ACCESS, token);
}

function clearStoredAuth() {
  localStorage.removeItem(LS_ACCESS);
  localStorage.removeItem(LS_EMAIL);
}

// -----------------------------
// UI helpers
// -----------------------------
function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function ProtectedRoute({ isAuthed, children }) {
  if (!isAuthed) return <Navigate to="/login" replace />;
  return children;
}

// -----------------------------
// App Shell (Sidebar + Layout)
// -----------------------------
function AppShell({ authFetch, onLogout }) {
  const location = useLocation();

  const navItemClass = ({ isActive }) =>
    cx("nav-item", isActive && "active");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">CF</div>
          <div className="brand-text">
            <div className="brand-title">CipherFlow</div>
            <div className="brand-sub">Inbox-IA-Pro</div>
          </div>
        </div>

        <nav className="nav">
          <NavLink to="/dashboard" className={navItemClass}>
            Dashboard
          </NavLink>

          <NavLink to="/emails/history" className={navItemClass}>
            Historique Emails
          </NavLink>

          {/* ✅ AJOUT : Analyse Email */}
          <NavLink to="/emails/analyze" className={navItemClass}>
            Analyse Email
          </NavLink>

          <NavLink to="/documents" className={navItemClass}>
            Analyse de documents
          </NavLink>

          <NavLink to="/invoices" className={navItemClass}>
            Quittances
          </NavLink>

          <NavLink to="/tenant-files" className={navItemClass}>
            Dossiers locataires
          </NavLink>

          <NavLink to="/settings" className={navItemClass}>
            Paramètres
          </NavLink>

          <div className="nav-spacer" />

          <button className="btn btn-ghost" onClick={onLogout}>
            Se déconnecter
          </button>

          {localStorage.getItem(LS_EMAIL) ? (
            <div className="muted small" style={{ marginTop: 10 }}>
              {localStorage.getItem(LS_EMAIL)}
            </div>
          ) : null}
        </nav>
      </aside>

      <main className="content">
        <Routes>
          <Route
            path="/dashboard"
            element={<Dashboard authFetch={authFetch} />}
          />

          <Route
            path="/emails/history"
            element={<EmailHistory authFetch={authFetch} />}
          />

          {/* ✅ AJOUT : route analyse email */}
          <Route
            path="/emails/analyze"
            element={<EmailProcessor authFetch={authFetch} />}
          />

          <Route
            path="/documents"
            element={<FileAnalyzer authFetch={authFetch} />}
          />

          <Route
            path="/invoices"
            element={<InvoiceGenerator authFetch={authFetch} />}
          />

          <Route
            path="/tenant-files"
            element={<TenantFilesPanel authFetch={authFetch} />}
          />

          <Route
            path="/settings"
            element={<SettingsPanel authFetch={authFetch} />}
          />


          {/* fallback interne */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// -----------------------------
// AppInner (Auth + Routes globales)
// -----------------------------
function AppInner() {
  const navigate = useNavigate();
  const location = useLocation();

  const [accessToken, setAccessToken] = useState(getStoredAccessToken());
  const isAuthed = !!accessToken;

  // ---------------------
  // authFetch : centralise TOUS les appels backend
  // - ajoute Authorization
  // - refresh si 401
  // ---------------------
  const authFetch = useMemo(() => {
    return async (path, options = {}) => {
      const url = String(path || "").startsWith("http")
        ? String(path)
        : `${API_BASE}${String(path || "")}`;

      const headers = new Headers(options.headers || {});

      // Mets Content-Type JSON uniquement si pas FormData
      const isFormData = options.body instanceof FormData;
      if (!isFormData) {
        headers.set("Content-Type", headers.get("Content-Type") || "application/json");
      }

      const token = getStoredAccessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);

      const doFetch = async () => {
        return fetch(url, {
          ...options,
          headers,
          credentials: "include", // utile si refresh token en cookie
        });
      };

      let res = await doFetch();

      // Refresh automatique sur 401
      if (res.status === 401) {
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            credentials: "include",
          });

          if (refreshRes.ok) {
            const data = await refreshRes.json().catch(() => ({}));
            const newToken = data?.access_token;
            if (newToken) {
              setStoredAccessToken(newToken);
              setAccessToken(newToken);

              // retry avec nouveau token
              headers.set("Authorization", `Bearer ${newToken}`);
              res = await doFetch();
            }
          }
        } catch (_) {
          // ignore
        }
      }

      return res;
    };
  }, []);

  // Sync si token change ailleurs
  useEffect(() => {
    const onStorage = () => setAccessToken(getStoredAccessToken());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLogout = () => {
    clearStoredAuth();
    setAccessToken(null);
    navigate("/login", { replace: true });
  };

  const handleLoginSuccess = () => {
    setAccessToken(getStoredAccessToken());
    navigate("/dashboard", { replace: true });
  };

  // Si on tente d’accéder à une route protégée sans auth, on renvoie au login
  useEffect(() => {
   const publicPaths = ["/login", "/register", "/oauth/callback", "/verify-email"];
    if (!isAuthed && !publicPaths.includes(location.pathname)) {
      navigate("/login", { replace: true });
    }
  }, [isAuthed, location.pathname, navigate]);

  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={
          isAuthed ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login onLogin={handleLoginSuccess} />
          )
        }
      />

      <Route
        path="/register"
        element={
          isAuthed ? <Navigate to="/dashboard" replace /> : <Register />
        }
      />

      <Route
        path="/oauth/callback"
        element={<OAuthCallback onDone={handleLoginSuccess} />}
      />
      <Route
            path="/verify-email"       
            element={<VerifyEmail />}
            />


      {/* Protected shell */}
      <Route
        path="/*"
        element={
          <ProtectedRoute isAuthed={isAuthed}>
            <AppShell authFetch={authFetch} onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return <AppInner />;
}
