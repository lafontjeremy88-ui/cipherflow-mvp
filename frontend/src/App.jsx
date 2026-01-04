// frontend/src/App.jsx
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";

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

// API (ton fichier centralisé)
import { getToken, clearAuth, logout as apiLogout } from "./services/api";

function Protected({ children }) {
  const isAuthed = Boolean(getToken());
  if (!isAuthed) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = useState(Boolean(getToken()));

  useEffect(() => {
    setIsAuthed(Boolean(getToken()));
  }, []);

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch (e) {
      // même si l’API échoue, on nettoie côté front
      console.warn("Logout API failed:", e);
    }
    clearAuth();
    setIsAuthed(false);
    navigate("/login", { replace: true });
  };

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login onAuthed={() => setIsAuthed(true)} />} />
      <Route path="/register" element={<Register />} />
      <Route path="/oauth/callback" element={<OAuthCallback onAuthed={() => setIsAuthed(true)} />} />

      {/* Private */}
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard onLogout={handleLogout} />
          </Protected>
        }
      />

      <Route
        path="/history"
        element={
          <Protected>
            <EmailHistory />
          </Protected>
        }
      />

      <Route
        path="/invoices"
        element={
          <Protected>
            <InvoiceGenerator />
          </Protected>
        }
      />

      <Route
        path="/tenants"
        element={
          <Protected>
            <TenantFilesPanel />
          </Protected>
        }
      />

      <Route
        path="/documents"
        element={
          <Protected>
            <FileAnalyzer />
          </Protected>
        }
      />

      <Route
        path="/settings"
        element={
          <Protected>
            <SettingsPanel />
          </Protected>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to={isAuthed ? "/" : "/login"} replace />} />
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
