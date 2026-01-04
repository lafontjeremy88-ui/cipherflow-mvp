// frontend/src/App.jsx

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

import {
  authFetch,
  login as apiLogin,
  logout as apiLogout,
  getToken,
  getEmail,
  isAuthed,
} from "./services/api";

function ProtectedRoute({ isAuthenticated, children }) {
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [token, setTokenState] = useState(getToken());
  const [email, setEmailState] = useState(getEmail());

  const isAuthenticated = useMemo(() => !!token && isAuthed(), [token]);

  // sync localStorage -> state (au cas où refresh met à jour le token)
  useEffect(() => {
    const t = getToken();
    const e = getEmail();
    setTokenState(t);
    setEmailState(e);
  }, []);

  const doLogin = useCallback(async (email, password) => {
    await apiLogin(email, password);
    setTokenState(getToken());
    setEmailState(getEmail());
  }, []);

  const doLogout = useCallback(async () => {
    await apiLogout();
    setTokenState("");
    setEmailState("");
  }, []);

  // IMPORTANT: on passe authFetch tel quel aux pages
  const authedFetch = useCallback((path, options) => authFetch(path, options), []);

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <Login onLogin={doLogin} />
            )
          }
        />

        <Route
          path="/register"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <Register />
            )
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <DashboardPage authFetch={authedFetch} onLogout={doLogout} email={email} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/emails"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <EmailProcessingPage authFetch={authedFetch} onLogout={doLogout} email={email} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/invoices"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <InvoicesPage authFetch={authedFetch} onLogout={doLogout} email={email} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/tenants"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <TenantFilesPage authFetch={authedFetch} onLogout={doLogout} email={email} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/documents"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <DocumentAnalyzerPage authFetch={authedFetch} onLogout={doLogout} email={email} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/history"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <HistoryPage authFetch={authedFetch} onLogout={doLogout} email={email} />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <SettingsPage authFetch={authedFetch} onLogout={doLogout} email={email} />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
      </Routes>
    </Router>
  );
}
