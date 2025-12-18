import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import OAuthCallback from "./OAuthCallback";

// 👉 Mets ici l’URL de ton backend Railway (PAS celle de Vercel)
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://cipherflow-mvp-production.up.railway.app";

// --- Petite protection de route (simple et efficace)
function RequireAuth({ children }) {
  const token = localStorage.getItem("cf_token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

// --- Page Login minimaliste (tu peux remplacer par ta vraie page)
function LoginPage() {
  const handleGoogle = () => {
    // redirection vers ton backend → /auth/google/login
    window.location.href = `${API_BASE_URL}/auth/google/login`;
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ width: 360, padding: 24, border: "1px solid #333", borderRadius: 12 }}>
        <h2 style={{ marginBottom: 16 }}>CipherFlow</h2>

        <button
          onClick={handleGoogle}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #444",
            cursor: "pointer",
            marginTop: 10
          }}
        >
          Continuer avec Google
        </button>

        <p style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
          Après Google, tu dois revenir sur <code>/oauth/callback</code> avec un token.
        </p>
      </div>
    </div>
  );
}

// --- Dashboard minimaliste (tu remplaces par ton vrai dashboard)
function Dashboard() {
  const logout = () => {
    localStorage.removeItem("cf_token");
    localStorage.removeItem("cf_user");
    window.location.href = "/login";
  };

  const user = localStorage.getItem("cf_user");

  return (
    <div style={{ padding: 24 }}>
      <h1>Dashboard</h1>
      <pre style={{ marginTop: 12, padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        Token présent: {localStorage.getItem("cf_token") ? "✅ oui" : "❌ non"}
        {"\n"}
        User: {user || "(vide)"}
      </pre>
      <button onClick={logout} style={{ marginTop: 12, padding: "10px 12px", cursor: "pointer" }}>
        Se déconnecter
      </button>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Route de callback Google */}
        <Route path="/oauth/callback" element={<OAuthCallback />} />

        {/* Exemple de page protégée */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />

        {/* Par défaut */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
