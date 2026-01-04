import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import DashboardPage from "./pages/Dashboard";
import EmailProcessingPage from "./pages/EmailProcessing";
import InvoicesPage from "./pages/Invoices";
import TenantFilesPage from "./pages/TenantFiles";
import DocumentAnalyzerPage from "./pages/DocumentAnalyzer";
import HistoryPage from "./pages/History";
import SettingsPage from "./pages/Settings";

import Login from "./components/Login";
import Register from "./components/Register";

// ✅ Source unique Auth
import {
  apiFetch,
  initSession,
  logout as apiLogout,
  setToken,
  setEmail,
  getToken,
  getEmail,
} from "./services/api";

export default function App() {
  const [token, setTokenState] = useState(() => getToken() || "");
  const [email, setEmailState] = useState(() => getEmail() || "");
  const [showRegister, setShowRegister] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const isAuthenticated = useMemo(() => !!token, [token]);

  // ✅ Au démarrage : refresh silencieux (via cookie refresh_token)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const session = await initSession();
        if (cancelled) return;

        setTokenState(session.token || "");
        setEmailState(session.email || "");
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ Callback reçu depuis <Login /> / <Register />
  // On accepte plusieurs formats (string ou objet)
  const onAuthSuccess = useCallback((payload, maybeEmail) => {
    let newToken = "";
    let newEmail = "";

    if (typeof payload === "string") {
      newToken = payload;
      newEmail = maybeEmail || "";
    } else if (payload && typeof payload === "object") {
      newToken =
        payload.token ||
        payload.access_token ||
        payload.jwt ||
        payload?.data?.token ||
        payload?.data?.access_token ||
        "";

      newEmail =
        payload.email ||
        payload.user_email ||
        payload?.user?.email ||
        payload?.data?.email ||
        maybeEmail ||
        "";
    }

    if (newToken) {
      setToken(newToken);
      setTokenState(newToken);
    }
    if (newEmail) {
      setEmail(newEmail);
      setEmailState(newEmail);
    }
  }, []);

  const onLogout = useCallback(async () => {
    await apiLogout();
    setTokenState("");
    setEmailState("");
  }, []);

  // ✅ Protection simple des routes
  const ProtectedRoute = ({ children }) => {
    if (!authReady) return null;
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return children;
  };

  if (!authReady) return null;

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <div>
                {showRegister ? (
                  <Register onLogin={onAuthSuccess} />
                ) : (
                  <Login onLogin={onAuthSuccess} />
                )}

                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => setShowRegister((v) => !v)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#8aa4ff",
                      cursor: "pointer",
                    }}
                  >
                    {showRegister
                      ? "Déjà un compte ? Se connecter"
                      : "Pas de compte ? S'inscrire"}
                  </button>
                </div>
              </div>
            )
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage authFetch={apiFetch} onLogout={onLogout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/emails"
          element={
            <ProtectedRoute>
              <EmailProcessingPage authFetch={apiFetch} onLogout={onLogout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute>
              <InvoicesPage authFetch={apiFetch} onLogout={onLogout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tenant-files"
          element={
            <ProtectedRoute>
              <TenantFilesPage authFetch={apiFetch} onLogout={onLogout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <DocumentAnalyzerPage authFetch={apiFetch} onLogout={onLogout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage authFetch={apiFetch} onLogout={onLogout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage authFetch={apiFetch} onLogout={onLogout} email={email} />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
      </Routes>
    </Router>
  );
}
