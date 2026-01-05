import React, { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  NavLink,
  useNavigate,
  useLocation,
} from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import EmailHistory from "./components/EmailHistory";

// ⚠️ Adapte ces imports à TES fichiers si les noms diffèrent
import EmailProcessor from "./pages/EmailProcessor";
import ReceiptGenerator from "./pages/ReceiptGenerator";
import FileAnalyzer from "./pages/FileAnalyzer";
import Settings from "./pages/Settings";
import Login from "./pages/Login";

// =====================
// Config
// =====================
const API_BASE =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  "http://localhost:8000";

// =====================
// Helpers
// =====================
function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function getStoredAccessToken() {
  return localStorage.getItem("access_token") || "";
}

function setStoredAccessToken(token) {
  if (!token) localStorage.removeItem("access_token");
  else localStorage.setItem("access_token", token);
}

// =====================
// Layout
// =====================
function AppShell({ authFetch, onLogout }) {
  const location = useLocation();

  const navItems = [
    { to: "/dashboard", label: "Vue d'ensemble", icon: "🕒" },
    { to: "/email", label: "Traitement Email", icon: "✉️" },
    { to: "/receipts", label: "Quittances & Loyers", icon: "📄" },
    { to: "/documents", label: "Dossiers Locataires", icon: "📁" },
    { to: "/emails", label: "Historique", icon: "🕘" },
    { to: "/settings", label: "Paramètres", icon: "⚙️" },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">CipherFlow V2</span>
        </div>

        <div className="userbox">
          <div className="avatar">👤</div>
          <div className="userinfo">
            <div className="status">Connecté</div>
            <div className="email">_</div>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                cx("nav-item", isActive && "active")
              }
            >
              <span className="nav-icon">{it.icon}</span>
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="nav-bottom">
          <button className="logout" onClick={onLogout}>
            ⮐ Déconnexion
          </button>
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route
            path="/dashboard"
            element={<Dashboard authFetch={authFetch} />}
          />
          <Route path="/emails" element={<EmailHistory authFetch={authFetch} />} />

          {/* ⚠️ adapte si besoin */}
          <Route path="/email" element={<EmailProcessor authFetch={authFetch} />} />
          <Route
            path="/receipts"
            element={<ReceiptGenerator authFetch={authFetch} />}
          />
          <Route
            path="/documents"
            element={<FileAnalyzer authFetch={authFetch} />}
          />
          <Route path="/settings" element={<Settings authFetch={authFetch} />} />

          {/* fallback */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function AppInner() {
  const navigate = useNavigate();
  const location = useLocation();

  const [accessToken, setAccessToken] = useState(getStoredAccessToken());
  const isAuthed = !!accessToken;

  // ---------------------
  // authFetch : TOUJOURS utiliser ça pour appeler le backend
  // ---------------------
  const authFetch = useMemo(() => {
    return async (path, options = {}) => {
      const url = String(path || "").startsWith("http")
        ? String(path)
        : `${API_BASE}${String(path || "")}`;

      const headers = new Headers(options.headers || {});
      headers.set("Content-Type", headers.get("Content-Type") || "application/json");

      const token = getStoredAccessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);

      const doFetch = async () => {
        return fetch(url, { ...options, headers, credentials: "include" });
      };

      let res = await doFetch();

      // Si 401 : refresh puis retry
      if (res.status === 401) {
        try {
          const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            credentials: "include",
          });

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json().catch(() => ({}));
            const newToken =
              refreshData?.access_token ||
              refreshData?.accessToken ||
              refreshData?.token ||
              "";

            if (newToken) {
              setStoredAccessToken(newToken);
              setAccessToken(newToken);

              // retry avec nouveau token
              headers.set("Authorization", `Bearer ${newToken}`);
              res = await doFetch();
            }
          } else {
            // refresh KO => logout
            setStoredAccessToken("");
            setAccessToken("");
          }
        } catch (e) {
          setStoredAccessToken("");
          setAccessToken("");
        }
      }

      return res;
    };
  }, []);

  // Redirection si pas loggé
  useEffect(() => {
    const publicPaths = ["/login"];
    const isPublic = publicPaths.includes(location.pathname);
    if (!isAuthed && !isPublic) navigate("/login", { replace: true });
    if (isAuthed && location.pathname === "/login")
      navigate("/dashboard", { replace: true });
  }, [isAuthed, location.pathname, navigate]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch (e) {
      // ignore
    }
    setStoredAccessToken("");
    setAccessToken("");
    navigate("/login", { replace: true });
  };

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Login
            apiBase={API_BASE}
            onLogin={(token) => {
              setStoredAccessToken(token);
              setAccessToken(token);
              navigate("/dashboard", { replace: true });
            }}
          />
        }
      />
      <Route path="/*" element={<AppShell authFetch={authFetch} onLogout={handleLogout} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AppInner />
    </Router>
  );
}
