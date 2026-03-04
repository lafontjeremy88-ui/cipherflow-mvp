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
import AccountPage from "./pages/AccountPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import LegalNotice from "./pages/LegalNotice";

// Components / Modules
import Login from "./components/Login";
import Register from "./components/Register";
import EmailHistory from "./components/EmailHistory";
import FileAnalyzer from "./components/FileAnalyzer";
import InvoiceGenerator from "./components/InvoiceGenerator";
import SettingsPanel from "./components/SettingsPanel";
import TenantFilesPanel from "./components/TenantFilesPanel";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

import EmailProcessor from "./pages/EmailProcessor";

// Services — token en mémoire (XSS-safe)
import {
  API_URL as API_BASE,
  getToken,
  setToken,
  clearAuth,
  getEmail,
  refreshAccessToken,
} from "./services/api";

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
  const navItemClass = ({ isActive }) => cx("nav-item", isActive && "active");

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

          <NavLink to="/emails/analyze" className={navItemClass}>
            Traitement Email
          </NavLink>

          <NavLink
            to="/emails/history"
            className={navItemClass}
            style={{ paddingLeft: "2rem", fontSize: "0.875rem", opacity: 0.85 }}
          >
            Historique
          </NavLink>

          <NavLink to="/documents" className={navItemClass}>
            Documents
          </NavLink>

          <NavLink to="/tenant-files" className={navItemClass}>
            Dossiers locataires
          </NavLink>

          <NavLink to="/account" className={navItemClass}>
            Mon compte
          </NavLink>

          <NavLink to="/settings" className={navItemClass}>
            Paramètres
          </NavLink>

          <div className="nav-spacer" />

          <button className="btn btn-ghost" onClick={onLogout}>
            Se déconnecter
          </button>

          {getEmail() ? (
            <div className="muted small" style={{ marginTop: 8 }}>
              {getEmail()}
            </div>
          ) : null}

          {/* 🔐 Bandeau RGPD global dans la sidebar */}
          <div
            className="muted"
            style={{
              marginTop: 14,
              paddingTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              fontSize: "11px",
              lineHeight: 1.4,
              opacity: 0.75,
            }}
          >
            🔐 Données protégées —{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "underline" }}
            >
              Politique de confidentialité
            </a>{" "}
            ·{" "}
            <a
              href="/mentions-legales"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "underline" }}
            >
              Mentions légales
            </a>
          </div>
        </nav>
      </aside>

      <main className="main-content">
        <Routes>
          <Route
            path="/dashboard"
            element={<Dashboard authFetch={authFetch} />}
          />

          <Route
            path="/emails/history"
            element={<EmailHistory authFetch={authFetch} />}
          />

          <Route
            path="/emails/analyze"
            element={<EmailProcessor authFetch={authFetch} />}
          />

          <Route
            path="/documents"
            element={<FileAnalyzer authFetch={authFetch} />}
          />

          <Route
            path="/tenant-files"
            element={<TenantFilesPanel authFetch={authFetch} />}
          />

          <Route
            path="/settings"
            element={<SettingsPanel authFetch={authFetch} />}
          />

          <Route
            path="/account"
            element={<AccountPage authFetch={authFetch} />}
          />

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

  // Token uniquement en mémoire — null au démarrage
  const [accessToken, setAccessToken] = useState(null);
  // Devient true une fois le check initial /auth/refresh terminé
  const [authChecked, setAuthChecked] = useState(false);

  const isAuthed = !!accessToken;

  // ── Hydration au montage ──────────────────────────────────────────────────
  // Tente de restaurer la session depuis le cookie HttpOnly de refresh.
  // Si le cookie est valide, on obtient un nouvel access token en mémoire.
  useEffect(() => {
    refreshAccessToken()
      .then((token) => {
        if (token) setAccessToken(token);
      })
      .finally(() => setAuthChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authFetch = useMemo(() => {
    return async (path, options = {}) => {
      const url = String(path || "").startsWith("http")
        ? String(path)
        : `${API_BASE}${String(path || "")}`;

      const headers = new Headers(options.headers || {});

      const isFormData = options.body instanceof FormData;
      if (!isFormData) {
        headers.set(
          "Content-Type",
          headers.get("Content-Type") || "application/json"
        );
      }

      const token = getToken(); // lit le module-level _accessToken (mémoire)
      if (token) headers.set("Authorization", `Bearer ${token}`);

      const doFetch = async () => {
        return fetch(url, {
          ...options,
          headers,
          credentials: "include",
        });
      };

      let res = await doFetch();

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
              setToken(newToken);
              setAccessToken(newToken);
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

  const handleLogout = () => {
    clearAuth();
    setAccessToken(null);
    navigate("/login", { replace: true });
  };

  const handleLoginSuccess = () => {
    // setToken() a déjà été appelé par login() ou exchange-token dans api.js
    setAccessToken(getToken());
    navigate("/dashboard", { replace: true });
  };

  // ── Redirection vers /login si non authentifié ────────────────────────────
  // On attend la fin du check initial pour ne pas rediriger prématurément
  useEffect(() => {
    if (!authChecked) return;
    const publicPaths = [
      "/login",
      "/register",
      "/oauth/callback",
      "/verify-email",
      "/forgot-password",
      "/reset-password",
      "/privacy",
      "/mentions-legales",
    ];
    if (!isAuthed && !publicPaths.includes(location.pathname)) {
      navigate("/login", { replace: true });
    }
  }, [isAuthed, authChecked, location.pathname, navigate]);

  // Pendant le check initial : spinner centré (évite le flash de /login)
  if (!authChecked) return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "var(--bg, #0f1117)",
    }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "3px solid rgba(255,255,255,0.10)",
        borderTopColor: "var(--accent, #6366f1)",
        animation: "cf-spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes cf-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

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
        path="/forgot-password"
        element={
          isAuthed ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <ForgotPassword />
          )
        }
      />

      <Route
        path="/reset-password"
        element={
          isAuthed ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <ResetPassword />
          )
        }
      />

      <Route
        path="/oauth/callback"
        element={<OAuthCallback onDone={handleLoginSuccess} />}
      />

      <Route path="/verify-email" element={<VerifyEmail />} />

      <Route path="/privacy" element={<PrivacyPolicy />} />

      <Route path="/mentions-legales" element={<LegalNotice />} />

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
