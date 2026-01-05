// frontend/src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
} from "react-router-dom";
import "./App.css";

// Pages
import Dashboard from "./pages/Dashboard";
import OAuthCallback from "./pages/OAuthCallback";

// Components
import Login from "./components/Login";
import Register from "./components/Register";
import EmailHistory from "./components/EmailHistory";
import InvoiceGenerator from "./components/InvoiceGenerator";
import TenantFilesPanel from "./components/TenantFilesPanel";
import FileAnalyzer from "./components/FileAnalyzer";
import SettingsPanel from "./components/SettingsPanel";

// API helpers
import { getToken, clearAuth, logout as apiLogout } from "./services/api";

/* =========================
   Layout privé (Sidebar + main)
========================= */
function PrivateLayout({ onLogout }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-title">CipherFlow V2</span>
        </div>

        <nav className="nav">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            Vue d&apos;ensemble
          </NavLink>

          <NavLink
            to="/emails"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            Traitement Email
          </NavLink>

          <NavLink
            to="/invoices"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            Quittances &amp; Loyers
          </NavLink>

          <NavLink
            to="/tenants"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            Dossiers Locataires
          </NavLink>

          <NavLink
            to="/docs"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            Analyse Docs
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            Paramètres
          </NavLink>
        </nav>

        <button className="nav-logout" onClick={onLogout}>
          Déconnexion
        </button>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

/* =========================
   Protection (si pas authed -> login)
========================= */
function Protected({ isAuthed }) {
  if (!isAuthed) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/* =========================
   App (routes)
========================= */
export default function App() {
  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = useState(Boolean(getToken()));

  useEffect(() => {
    const onStorage = () => setIsAuthed(Boolean(getToken()));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch (e) {
      console.warn("Logout backend failed:", e);
    } finally {
      clearAuth();
      setIsAuthed(false);
      navigate("/login", { replace: true });
    }
  };

  const authMemo = useMemo(() => ({ isAuthed }), [isAuthed]);

  return (
    <Routes>
      {/* ===== PUBLIC ===== */}
      <Route
        path="/login"
        element={
          authMemo.isAuthed ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login
              onLoginSuccess={() => {
                setIsAuthed(true);
                navigate("/dashboard", { replace: true });
              }}
            />
          )
        }
      />

      <Route
        path="/register"
        element={
          authMemo.isAuthed ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Register onRegisterSuccess={() => navigate("/login", { replace: true })} />
          )
        }
      />

      <Route
        path="/oauth/callback"
        element={
          <OAuthCallback
            onSuccess={() => {
              setIsAuthed(true);
              navigate("/dashboard", { replace: true });
            }}
          />
        }
      />

      {/* ===== PRIVÉ ===== */}
      <Route element={<Protected isAuthed={authMemo.isAuthed} />}>
        <Route element={<PrivateLayout onLogout={handleLogout} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/emails" element={<EmailHistory />} />
          <Route path="/invoices" element={<InvoiceGenerator />} />
          <Route path="/tenants" element={<TenantFilesPanel />} />
          <Route path="/docs" element={<FileAnalyzer />} />
          <Route path="/settings" element={<SettingsPanel />} />

          {/* Redirect root -> dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>

      {/* fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
