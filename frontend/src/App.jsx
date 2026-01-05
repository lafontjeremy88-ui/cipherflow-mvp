import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import OAuthCallback from "./pages/OAuthCallback";

import Login from "./components/Login";
import Register from "./components/Register";
import FileAnalyzer from "./components/FileAnalyzer";
import InvoiceGenerator from "./components/InvoiceGenerator";
import EmailHistory from "./components/EmailHistory";
import SettingsPanel from "./components/SettingsPanel";
import TenantFilesPanel from "./components/TenantFilesPanel";

import { getToken, getEmail, clearAuth } from "./services/api";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function ProtectedRoute({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(!!getToken());

  const userEmail = useMemo(() => getEmail() || "", [authed]);

  useEffect(() => {
    const onStorage = () => setAuthed(!!getToken());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleLogout = () => {
    clearAuth();
    setAuthed(false);
    navigate("/login", { replace: true });
  };

  const handleLoginSuccess = () => {
    setAuthed(true);
    navigate("/dashboard", { replace: true });
  };

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
          <NavLink to="/emails/history" className={navItemClass}>
            Historique Emails
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

          {authed ? (
            <button className="btn btn-ghost" onClick={handleLogout}>
              Se déconnecter
            </button>
          ) : (
            <div className="muted small">Non connecté</div>
          )}

          {authed && userEmail ? (
            <div className="muted small" style={{ marginTop: 10 }}>
              {userEmail}
            </div>
          ) : null}
        </nav>
      </aside>

      <main className="content">
        <Routes>
          {/* Public */}
          <Route
            path="/login"
            element={
              authed ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Login onLogin={handleLoginSuccess} />
              )
            }
          />
          <Route
            path="/register"
            element={authed ? <Navigate to="/dashboard" replace /> : <Register />}
          />

          {/* OAuth callback */}
          <Route path="/oauth/callback" element={<OAuthCallback onDone={handleLoginSuccess} />} />

          {/* Protected */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/emails/history"
            element={
              <ProtectedRoute>
                <EmailHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedRoute>
                <FileAnalyzer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <InvoiceGenerator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tenant-files"
            element={
              <ProtectedRoute>
                <TenantFilesPanel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPanel />
              </ProtectedRoute>
            }
          />

          {/* Default */}
          <Route path="/" element={<Navigate to={authed ? "/dashboard" : "/login"} replace />} />
          <Route path="*" element={<Navigate to={authed ? "/dashboard" : "/login"} replace />} />
        </Routes>
      </main>
    </div>
  );
}
