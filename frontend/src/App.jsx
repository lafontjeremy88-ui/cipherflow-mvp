import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  Link,
} from "react-router-dom";

import {
  LayoutDashboard,
  Mail,
  FileText,
  FolderOpen,
  FileSearch,
  History,
  Settings,
  LogOut,
  User,
  Shield,
  Building2,
  PieChart,
  FolderUp,
} from "lucide-react";

import Dashboard from "./pages/Dashboard";
import EmailProcessing from "./pages/EmailProcessing";
import RentReceipts from "./pages/RentReceipts";
import TenantFiles from "./pages/TenantFiles";
import DocumentAnalyzer from "./pages/DocumentAnalyzer";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";

import Login from "./pages/Login";
import Register from "./pages/Register";
import OAuthCallback from "./pages/OAuthCallback";

const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "https://cipherflow-mvp-production.up.railway.app";

function clearAuthStorage() {
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EMAIL);
    // Legacy keys (older versions)
    localStorage.removeItem("abc");
    localStorage.removeItem("token");
    localStorage.removeItem("access_token");
  } catch {}
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(LS_TOKEN) || "");
  const [userEmail, setUserEmail] = useState(localStorage.getItem(LS_EMAIL) || "");
  const [showRegister, setShowRegister] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const handleAuthSuccess = (accessToken, email) => {
    // Clean legacy keys so we don't keep "abc" around
    try {
      localStorage.removeItem("abc");
    } catch {}
    localStorage.setItem(LS_TOKEN, accessToken);
    localStorage.setItem(LS_EMAIL, email);
    setToken(accessToken);
    setUserEmail(email);
  };

  // 1) Boot session:
  // - If there is no access token in localStorage, we try to restore the session via /auth/refresh (refresh token cookie).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const hasToken = !!localStorage.getItem(LS_TOKEN);
        if (hasToken) {
          setAuthLoading(false);
          return;
        }

        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          setAuthLoading(false);
          return;
        }

        const data = await res.json();
        const accessToken = data?.access_token || data?.accessToken || "";
        if (!accessToken) {
          setAuthLoading(false);
          return;
        }

        clearAuthStorage();
        localStorage.setItem(LS_TOKEN, accessToken);
        if (data?.email) localStorage.setItem(LS_EMAIL, data.email);

        if (!cancelled) {
          setToken(accessToken);
          if (data?.email) setUserEmail(data.email);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Auto-refresh access token shortly before it expires
  useEffect(() => {
    if (!token) return;

    const parseJwt = (t) => {
      try {
        const payload = t.split(".")[1];
        const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(json);
      } catch {
        return null;
      }
    };

    const payload = parseJwt(token);
    const exp = payload?.exp ? payload.exp * 1000 : null;
    if (!exp) return;

    const now = Date.now();
    const delay = Math.max(exp - now - 60_000, 5_000);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("refresh_failed");

        const data = await res.json();
        const accessToken = data?.access_token || data?.accessToken || "";
        if (!accessToken) throw new Error("no_token");

        localStorage.setItem(LS_TOKEN, accessToken);
        setToken(accessToken);
      } catch {
        clearAuthStorage();
        setToken("");
        setUserEmail("");
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [token]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // ignore
    }
    clearAuthStorage();
    setToken("");
    setUserEmail("");
    setShowRegister(false);
  };

  return (
    <Router>
      <Routes>
        <Route
          path="/oauth/callback"
          element={<OAuthCallback onAuthSuccess={handleAuthSuccess} />}
        />
        <Route
          path="/*"
          element={
            <AppShell
              token={token}
              userEmail={userEmail}
              authLoading={authLoading}
              showRegister={showRegister}
              setShowRegister={setShowRegister}
              onAuthSuccess={handleAuthSuccess}
              onLogout={handleLogout}
            />
          }
        />
      </Routes>
    </Router>
  );
}

function AppShell({
  token,
  userEmail,
  authLoading,
  showRegister,
  setShowRegister,
  onAuthSuccess,
  onLogout,
}) {
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B1020] text-white">
        <div className="text-center">
          <div className="text-lg font-semibold">Chargement…</div>
          <div className="text-sm opacity-70 mt-2">Vérification de la session</div>
        </div>
      </div>
    );
  }

  if (!token) {
    // Auth pages
    if (showRegister) {
      return (
        <Register
          onSuccess={(accessToken, email) => {
            onAuthSuccess(accessToken, email);
            setShowRegister(false);
          }}
          onSwitchToLogin={() => setShowRegister(false)}
        />
      );
    }

    return (
      <Login
        onSuccess={(accessToken, email) => onAuthSuccess(accessToken, email)}
        onSwitchToRegister={() => setShowRegister(true)}
      />
    );
  }

  // Logged in app
  return <MainLayout userEmail={userEmail} onLogout={onLogout} />;
}

function MainLayout({ userEmail, onLogout }) {
  const location = useLocation();

  const nav = [
    { to: "/", label: "Vue d'ensemble", icon: LayoutDashboard },
    { to: "/emails", label: "Traitement Email", icon: Mail },
    { to: "/quittances", label: "Quittances & Loyers", icon: FileText },
    { to: "/dossiers", label: "Dossiers Locataires", icon: FolderOpen },
    { to: "/analyse", label: "Analyse Docs", icon: FileSearch },
    { to: "/historique", label: "Historique", icon: History },
    { to: "/parametres", label: "Paramètres", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0B1020] text-white flex">
      {/* Sidebar */}
      <aside className="w-[280px] bg-[#0E1630] border-r border-white/5 p-5 flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <div className="font-bold text-lg">CipherFlow V2</div>
          </div>
        </div>

        <div className="rounded-xl bg-white/5 border border-white/10 p-3 mb-5">
          <div className="text-sm opacity-70 flex items-center gap-2">
            <User className="w-4 h-4" />
            Connecté
          </div>
          <div className="text-sm mt-1 truncate">{userEmail}</div>
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          {nav.map((item) => {
            const active =
              item.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                  active ? "bg-indigo-500/30 border border-indigo-400/30" : "hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4 opacity-80" />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          onClick={onLogout}
          className="mt-4 flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-300 transition"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">Déconnexion</span>
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/emails" element={<EmailProcessing />} />
          <Route path="/quittances" element={<RentReceipts />} />
          <Route path="/dossiers" element={<TenantFiles />} />
          <Route path="/analyse" element={<DocumentAnalyzer />} />
          <Route path="/historique" element={<HistoryPage />} />
          <Route path="/parametres" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
