import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import OAuthCallback from "./OAuthCallback";

function getToken() {
  return localStorage.getItem("token");
}

function ProtectedRoute({ children }) {
  const token = getToken();
  return token ? children : <Navigate to="/login" replace />;
}

function LoginPage() {
  const API_URL =
    import.meta.env.VITE_API_URL ||
    "https://cipherflow-mvp-production.up.railway.app";

  const handleGoogle = () => {
    // On lance OAuth côté backend
    window.location.href = `${API_URL}/auth/google/login`;
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, padding: 24, borderRadius: 12, border: "1px solid #222" }}>
        <h2 style={{ marginTop: 0 }}>CipherFlow</h2>
        <p style={{ opacity: 0.8 }}>Connexion à l’espace pro</p>

        <button
          onClick={handleGoogle}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            cursor: "pointer",
            marginTop: 12,
          }}
        >
          Continuer avec Google
        </button>
      </div>
    </div>
  );
}

function DashboardPage() {
  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Dashboard</h1>
      <p>✅ Connecté (token présent)</p>
      <button onClick={logout}>Se déconnecter</button>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Racine : redirige selon token */}
        <Route
          path="/"
          element={getToken() ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />}
        />

        <Route path="/login" element={<LoginPage />} />

        {/* IMPORTANT : la route callback OAuth */}
        <Route path="/oauth/callback" element={<OAuthCallback />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        {/* fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
