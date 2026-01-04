// frontend/src/App.jsx
import React, { useEffect, useMemo, useState } from "react";


// Pages existantes
import Dashboard from "./pages/Dashboard";
import OAuthCallback from "./pages/OAuthCallback";

// Components existants
import Login from "./components/Login";
import Register from "./components/Register";
import EmailHistory from "./components/EmailHistory";
import InvoiceGenerator from "./components/InvoiceGenerator";
import TenantFilesPanel from "./components/TenantFilesPanel";
import FileAnalyzer from "./components/FileAnalyzer";
import SettingsPanel from "./components/SettingsPanel";

import { getToken, clearAuth, logout as apiLogout } from "./services/api";

function PrivateLayout({ onLogout, children }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-title">CipherFlow V2</span>
        </div>

        <nav className="nav">
          <Link className="nav-item" to="/dashboard">Vue d&apos;ensemble</Link>
          <Link className="nav-item" to="/emails">Traitement Email</Link>
          <Link className="nav-item" to="/invoices">Quittances &amp; Loyers</Link>
          <Link className="nav-item" to="/tenants">Dossiers Locataires</Link>
          <Link className="nav-item" to="/docs">Analyse Docs</Link>
          <Link className="nav-item" to="/settings">Paramètres</Link>
        </nav>

        <button className="nav-logout" onClick={onLogout}>
          Déconnexion
        </button>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}

function Protected({ isAuthed, children }) {
  if (!isAuthed) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
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
      {/* Public */}
      <Route
        path="/login"
        element={
          isAuthed ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login onLoginSuccess={() => { setIsAuthed(true); navigate("/dashboard", { replace: true }); }} />
          )
        }
      />
      <Route
        path="/register"
        element={
          isAuthed ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Register onRegisterSuccess={() => navigate("/login", { replace: true })} />
          )
        }
      />
      <Route
        path="/oauth/callback"
        element={<OAuthCallback onSuccess={() => { setIsAuthed(true); navigate("/dashboard", { replace: true }); }} />}
      />

      {/* Privé */}
      <Route
        path="/*"
        element={
          <Protected isAuthed={authMemo.isAuthed}>
            <PrivateLayout onLogout={handleLogout}>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/emails" element={<EmailHistory />} />
                <Route path="/invoices" element={<InvoiceGenerator />} />
                <Route path="/tenants" element={<TenantFilesPanel />} />
                <Route path="/docs" element={<FileAnalyzer />} />
                <Route path="/settings" element={<SettingsPanel />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </PrivateLayout>
          </Protected>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
