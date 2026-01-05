// frontend/src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";

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
   Layout privé
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
          <NavLink className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} to="/dashboard">
            Vue d&apos;ensemble
          </NavLink>
          <NavLink className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} to="/emails">
            Traitement Email
          </NavLink>
          <NavLink className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} to="/invoices">
            Quittances &amp; Loyers
          </NavLink>
          <NavLink className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} to="/tenants">
            Dossiers Locataires
          </NavLink>
          <NavLink className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} to="/docs">
            Analyse Docs
          </NavLink>
          <NavLink className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} to="/settings">
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
   Protection
========================= */
function Protected({ isAuthed }) {
  if (!isAuthed) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/* =========================
   App
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
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
