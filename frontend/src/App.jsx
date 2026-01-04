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

const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

// ✅ Mets ça dans Vercel : VITE_API_URL=https://cipherflow-mvp-production.up.railway.app
const API_BASE = (import.meta?.env?.VITE_API_URL || "").replace(/\/$/, "");

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractTokenFromRefreshResponse(data) {
  // On accepte plusieurs formats possibles pour être robuste
  return (
    data?.access_token ||
    data?.token ||
    data?.jwt ||
    data?.data?.access_token ||
    null
  );
}

function buildUrl(pathOrUrl) {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!API_BASE) return pathOrUrl; // fallback si env manquant (mais à éviter)
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${API_BASE}${path}`;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(LS_TOKEN) || "");
  const [email, setEmail] = useState(() => localStorage.getItem(LS_EMAIL) || "");
  const [showRegister, setShowRegister] = useState(false);
  const [authReady, setAuthReady] = useState(false); // évite des flashs au chargement

  // ✅ Nettoyage des anciennes clés parasites (ex: "abc")
  useEffect(() => {
    try {
      localStorage.removeItem("abc");
      localStorage.removeItem("token"); // si tu avais une ancienne key générique
      localStorage.removeItem("email"); // idem
    } catch {}
  }, []);

  const isAuthenticated = useMemo(() => !!token, [token]);

  const persistAuth = useCallback((newToken, newEmail) => {
    if (newToken) {
      localStorage.setItem(LS_TOKEN, newToken);
      setToken(newToken);
    }
    if (newEmail) {
      localStorage.setItem(LS_EMAIL, newEmail);
      setEmail(newEmail);
    }
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EMAIL);
    setToken("");
    setEmail("");
  }, []);

  // ✅ Appel refresh : récupère un nouveau access token via cookie refresh (credentials include)
  const refreshAccessToken = useCallback(async () => {
    const url = buildUrl("/auth/refresh");

    const res = await fetch(url, {
      method: "POST",
      credentials: "include", // IMPORTANT : envoie les cookies
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json().catch(() => null);
    const newToken = extractTokenFromRefreshResponse(data);
    return newToken || null;
  }, []);

  // ✅ Logout backend (optionnel mais pro) + nettoyage local
  const logout = useCallback(async () => {
    try {
      const url = buildUrl("/auth/logout");
      await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  // ✅ authFetch PRO : retry après refresh
  const authFetch = useCallback(
    async (pathOrUrl, options = {}) => {
      const url = buildUrl(pathOrUrl);

      const doRequest = async (jwt, isRetry = false) => {
        const headers = new Headers(options.headers || {});
        headers.set("Content-Type", headers.get("Content-Type") || "application/json");

        if (jwt) {
          headers.set("Authorization", `Bearer ${jwt}`);
        }

        const res = await fetch(url, {
          ...options,
          headers,
          credentials: "include", // IMPORTANT : pour refresh cookie + CORS allow-credentials
        });

        // ✅ Si token expiré → refresh → retry 1 fois
        if (res.status === 401 && !isRetry) {
          const newToken = await refreshAccessToken();
          if (newToken) {
            persistAuth(newToken, null);
            return doRequest(newToken, true);
          }
          // refresh impossible → logout
          await logout();
          throw new Error("Unauthorized (refresh failed)");
        }

        return res;
      };

      return doRequest(token, false);
    },
    [token, refreshAccessToken, persistAuth, logout]
  );

  // ✅ Au démarrage : si on a déjà un token → on tente un refresh silencieux (pro)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (token) {
          const newToken = await refreshAccessToken();
          if (!cancelled && newToken) {
            persistAuth(newToken, null);
          }
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, refreshAccessToken, persistAuth]);

  // ✅ Callback reçu depuis <Login /> ou <Register />
  const onAuthSuccess = useCallback(
    (payload, maybeEmail) => {
      // On supporte plusieurs formats :
      // 1) onLogin(token, email)
      // 2) onLogin({ token, email })
      // 3) onLogin({ access_token, email })
      if (typeof payload === "string") {
        persistAuth(payload, maybeEmail || "");
        return;
      }

      const t =
        payload?.token ||
        payload?.access_token ||
        payload?.jwt ||
        payload?.data?.token ||
        payload?.data?.access_token ||
        "";

      const e = payload?.email || payload?.user?.email || payload?.data?.email || "";

      if (t) {
        persistAuth(t, e);
      }
    },
    [persistAuth]
  );

  // ✅ Petit composant de protection des routes
  const ProtectedRoute = ({ children }) => {
    if (!authReady) return null; // évite flash login/dashboard
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
              <DashboardPage authFetch={authFetch} onLogout={logout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/emails"
          element={
            <ProtectedRoute>
              <EmailProcessingPage authFetch={authFetch} onLogout={logout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute>
              <InvoicesPage authFetch={authFetch} onLogout={logout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tenant-files"
          element={
            <ProtectedRoute>
              <TenantFilesPage authFetch={authFetch} onLogout={logout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <DocumentAnalyzerPage authFetch={authFetch} onLogout={logout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage authFetch={authFetch} onLogout={logout} email={email} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage authFetch={authFetch} onLogout={logout} email={email} />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
      </Routes>
    </Router>
  );
}
