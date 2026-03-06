import React, { useEffect, useMemo, useState, Component } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";

// Layout
import AppLayout from "./components/layout/AppLayout";

// Public pages
import Login from "./components/Login";
import Register from "./components/Register";
import OAuthCallback from "./pages/OAuthCallback";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import LegalNotice from "./pages/LegalNotice";
import Terms from "./pages/Terms";
import Onboarding from "./pages/Onboarding";
import Error500 from "./pages/Error500";
import Error404 from "./pages/Error404";

// Services
import {
  API_URL as API_BASE,
  getToken,
  setToken,
  clearAuth,
  refreshAccessToken,
} from "./services/api";

function ProtectedRoute({ isAuthed, children }) {
  if (!isAuthed) return <Navigate to="/login" replace />;
  return children;
}

// ─── AppInner ────────────────────────────────────────────────────────────────

function AppInner() {
  const navigate = useNavigate();
  const location = useLocation();

  const [accessToken, setAccessToken] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const isAuthed = !!accessToken;

  // Restauration de session depuis le cookie refresh
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
        headers.set("Content-Type", headers.get("Content-Type") || "application/json");
      }

      const token = getToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);

      const doFetch = async () =>
        fetch(url, { ...options, headers, credentials: "include" });

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
    setAccessToken(getToken());
    navigate("/onboarding", { replace: true });
  };

  // Redirection vers /login si non authentifié
  useEffect(() => {
    if (!authChecked) return;
    const publicPaths = [
      "/login", "/register", "/oauth/callback", "/verify-email",
      "/forgot-password", "/reset-password", "/privacy",
      "/mentions-legales", "/terms",
    ];
    if (!isAuthed && !publicPaths.includes(location.pathname)) {
      navigate("/login", { replace: true });
    }
  }, [isAuthed, authChecked, location.pathname, navigate]);

  // Spinner initial
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-bg">
        <div className="cf-spinner" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={isAuthed ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLoginSuccess} />}
      />
      <Route
        path="/register"
        element={isAuthed ? <Navigate to="/dashboard" replace /> : <Register />}
      />
      <Route
        path="/forgot-password"
        element={isAuthed ? <Navigate to="/dashboard" replace /> : <ForgotPassword />}
      />
      <Route
        path="/reset-password"
        element={isAuthed ? <Navigate to="/dashboard" replace /> : <ResetPassword />}
      />
      <Route path="/oauth/callback" element={<OAuthCallback onDone={handleLoginSuccess} />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/mentions-legales" element={<LegalNotice />} />
      <Route path="/terms" element={<Terms />} />

      {/* Onboarding (protégé, hors AppLayout) */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute isAuthed={isAuthed}>
            <Onboarding authFetch={authFetch} />
          </ProtectedRoute>
        }
      />

      {/* Shell protégé */}
      <Route
        path="/*"
        element={
          <ProtectedRoute isAuthed={isAuthed}>
            <AppLayout authFetch={authFetch} onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.hasError) return <Error500 />;
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
