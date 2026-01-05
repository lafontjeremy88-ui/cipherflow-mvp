import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Send,
  History,
  Zap,
  CheckCircle,
  AlertCircle,
  Mail,
  Settings,
  LogOut,
  FileText,
  User,
  FolderSearch,
  PieChart,
  FolderUp,
} from "lucide-react";

import "./App.css";

// Pages / Components
import Login from "./components/Login";
import Register from "./components/Register";
import FileAnalyzer from "./components/FileAnalyzer";
import InvoiceGenerator from "./components/InvoiceGenerator";
import EmailHistory from "./components/EmailHistory";
import SettingsPanel from "./components/SettingsPanel";
import TenantFilesPanel from "./components/TenantFilesPanel";
import DashboardPage from "./pages/Dashboard";
import OAuthCallback from "./pages/OAuthCallback";

// API helpers (depuis ton frontend/src/services/api.js)
import {
  getToken,
  getEmail,
  setToken,
  setEmail,
  clearAuth,
  authFetch as coreAuthFetch,
  refreshAccessToken,
  logout as apiLogout,
} from "./services/api";

/** Optionnel : utile si certains composants appellent encore l'API en URL absolue */
const API_BASE = "https://cipherflow-mvp-production.up.railway.app";

/* ---------------------------
   Petits helpers
---------------------------- */
function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

/* ---------------------------
   App (Router)
---------------------------- */
export default function App() {
  const [bootLoading, setBootLoading] = useState(true);
  const [tokenState, setTokenState] = useState(getToken());
  const [emailState, setEmailState] = useState(getEmail());

  // Wrapper stable pour authFetch
  const authFetch = useCallback((url, options = {}) => coreAuthFetch(url, options), []);

  // Boot: tente un refresh si pas de token (ou token expiré plus tard géré par authFetch)
  useEffect(() => {
    (async () => {
      try {
        if (!getToken()) {
          await refreshAccessToken(); // si cookie refresh_token valide => nouveau access token
        }
      } finally {
        setTokenState(getToken());
        setEmailState(getEmail());
        setBootLoading(false);
      }
    })();
  }, []);

  const handleAuthSuccess = useCallback((newToken, userEmail) => {
    // Les composants Login/Register/OAuthCallback peuvent déjà écrire en storage,
    // mais on sécurise le state ici.
    if (newToken) setToken(newToken);
    if (userEmail) setEmail(userEmail);

    setTokenState(getToken());
    setEmailState(getEmail());
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // ignore
    } finally {
      clearAuth();
      setTokenState(null);
      setEmailState(null);
    }
  }, []);

  if (bootLoading) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1220",
          color: "white",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <Zap size={40} />
        <div style={{ fontSize: "1.05rem", opacity: 0.9 }}>Chargement de la session…</div>
      </div>
    );
  }

  return (
    <Routes>
      {/* OAuth callback */}
      <Route path="/oauth/callback" element={<OAuthCallback onSuccess={handleAuthSuccess} />} />

      {/* Auth pages */}
      <Route
        path="/login"
        element={
          tokenState ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthScreen mode="login" onAuthSuccess={handleAuthSuccess} />
          )
        }
      />
      <Route
        path="/register"
        element={
          tokenState ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthScreen mode="register" onAuthSuccess={handleAuthSuccess} />
          )
        }
      />

      {/* Protected app */}
      <Route
        path="/*"
        element={
          tokenState ? (
            <AppLayout
              token={tokenState}
              userEmail={emailState}
              onLogout={handleLogout}
              authFetch={authFetch}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

/* ---------------------------
   Auth screen (login/register)
---------------------------- */
function AuthScreen({ mode, onAuthSuccess }) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b1220",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "#1f2a44", display: "grid", placeItems: "center" }}>
            <Zap />
          </div>
          <div style={{ color: "white" }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>CipherFlow V2</div>
            <div style={{ opacity: 0.75, fontSize: 13 }}>
              {mode === "login" ? "Connexion" : "Créer un compte"}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          {mode === "login" ? (
            <Login
              onLogin={(t, e) => {
                onAuthSuccess(t, e);
                navigate("/dashboard");
              }}
            />
          ) : (
            <Register
              onLogin={(t, e) => {
                onAuthSuccess(t, e);
                navigate("/dashboard");
              }}
            />
          )}

          <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
            {mode === "login" ? (
              <button className="btn btn-secondary" style={{ width: "100%" }} onClick={() => navigate("/register")}>
                Créer un compte
              </button>
            ) : (
              <button className="btn btn-secondary" style={{ width: "100%" }} onClick={() => navigate("/login")}>
                Déjà un compte ? Se connecter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------
   Layout + Pages
---------------------------- */
function AppLayout({ token, userEmail, onLogout, authFetch }) {
  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo">
          <Zap size={22} />
          <span>CipherFlow V2</span>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            <User size={16} />
          </div>
          <div className="sidebar-user-meta">
            <div className="sidebar-user-title">Connecté</div>
            <div className="sidebar-user-email" title={userEmail || ""}>
              {userEmail || "—"}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavItem to="/dashboard" icon={<PieChart size={18} />} label="Vue d'ensemble" />
          <NavItem to="/emails" icon={<LayoutDashboard size={18} />} label="Traitement Email" />
          <NavItem to="/invoices" icon={<FileText size={18} />} label="Quittances & Loyers" />
          <NavItem to="/tenants" icon={<FolderSearch size={18} />} label="Dossiers Locataires" />
          <NavItem to="/docs" icon={<FolderUp size={18} />} label="Analyse Docs" />
          <NavItem to="/history" icon={<History size={18} />} label="Historique" />
          <NavItem to="/settings" icon={<Settings size={18} />} label="Paramètres" />

          <button className="sidebar-logout" onClick={onLogout} type="button">
            <LogOut size={18} />
            Déconnexion
          </button>
        </nav>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route
            path="/dashboard"
            element={
              <DashboardRoute token={token} authFetch={authFetch} />
            }
          />

          <Route
            path="/emails"
            element={<EmailProcessPage token={token} authFetch={authFetch} />}
          />

          <Route
            path="/history"
            element={<HistoryRoute token={token} authFetch={authFetch} />}
          />

          <Route
            path="/invoices"
            element={<InvoiceGenerator token={token} authFetch={authFetch} />}
          />

          <Route
            path="/tenants"
            element={<TenantFilesPanel authFetch={authFetch} apiBase={API_BASE} />}
          />

          <Route
            path="/docs"
            element={<FileAnalyzer authFetch={authFetch} apiBase={API_BASE} />}
          />

          <Route
            path="/settings"
            element={<SettingsPanel token={token} authFetch={authFetch} />}
          />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
      end
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

/* ---------------------------
   Dashboard route wrapper
---------------------------- */
function DashboardRoute({ token, authFetch }) {
  const navigate = useNavigate();

  const onNavigate = (tabName, id = null) => {
    // si ton Dashboard déclenche une navigation (ex: clique activité => historique)
    if (tabName === "history") {
      const qs = id ? `?selected=${encodeURIComponent(id)}` : "";
      navigate(`/history${qs}`);
      return;
    }
    if (tabName === "docAnalysis") return navigate("/docs");
    if (tabName === "tenantFiles") return navigate("/tenants");
    if (tabName === "invoices") return navigate("/invoices");
    if (tabName === "settings") return navigate("/settings");
    if (tabName === "analyze") return navigate("/emails");
    navigate("/dashboard");
  };

  return <DashboardPage token={token} onNavigate={onNavigate} authFetch={authFetch} />;
}

/* ---------------------------
   History route wrapper (selected id)
---------------------------- */
function HistoryRoute({ token, authFetch }) {
  const q = useQuery();
  const selected = q.get("selected");
  return <EmailHistory token={token} initialId={selected ? String(selected) : null} authFetch={authFetch} />;
}

/* ---------------------------
   Traitement Email (analyse + réponse) - comme ton ancien rendu
---------------------------- */
function EmailProcessPage({ token, authFetch }) {
  // Email form
  const [fromEmail, setFromEmail] = useState("client@example.com");
  const [subject, setSubject] = useState("Problème de connexion");
  const [content, setContent] = useState("Bonjour...");
  const [analyse, setAnalyse] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");

  // UI states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleAnalyse = async () => {
    setErrorMessage("");
    setInfoMessage("");
    setIsAnalyzing(true);

    try {
      const res = await authFetch(`${API_BASE}/email/process`, {
        method: "POST",
        body: JSON.stringify({
          from_email: fromEmail,
          subject,
          content,
          send_email: false,
        }),
      });

      if (!res.ok) throw new Error("Erreur serveur lors de l'analyse");

      const data = await res.json();
      setAnalysisId(data.id ?? data.email_id);
      setAnalyse(data.analyse);
      setReplySubject(data.reponse?.subject || "");
      setReplyBody(data.reponse?.reply || "");
      setInfoMessage("Analyse terminée !");
    } catch (err) {
      setErrorMessage(err.message || "Erreur inconnue");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendEmail = async () => {
    setIsSending(true);
    setErrorMessage("");
    setInfoMessage("");

    try {
      const res = await authFetch(`${API_BASE}/email/send`, {
        method: "POST",
        body: JSON.stringify({
          to_email: fromEmail,
          subject: replySubject,
          body: replyBody,
          email_id: analysisId,
        }),
      });

      if (!res.ok) throw new Error("Erreur envoi email");

      setInfoMessage("Email envoyé ✅");
      setAnalyse(null);
      setAnalysisId(null);
      setContent("");
    } catch (err) {
      setErrorMessage(err.message || "Erreur inconnue");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div>
      <header style={{ marginBottom: "18px" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 800 }}>Traitement Intelligent</h1>
        <p style={{ opacity: 0.8, marginTop: 6 }}>
          Analyse un email, génère une réponse, et envoie-la en 1 clic.
        </p>
      </header>

      {errorMessage && (
        <div className="alert alert-error">
          <AlertCircle size={18} /> <span>{errorMessage}</span>
        </div>
      )}

      {infoMessage && (
        <div className="alert alert-success">
          <CheckCircle size={18} /> <span>{infoMessage}</span>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card">
          <h2 className="card-title">
            <Mail size={18} /> Email du Client
          </h2>

          <div className="form-group">
            <label>Expéditeur</label>
            <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Sujet</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="form-group">
            <label>Contenu</label>
            <textarea rows={7} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>

          <button className="btn btn-primary" onClick={handleAnalyse} disabled={isAnalyzing}>
            {isAnalyzing ? "Analyse..." : "Analyser"} <Zap size={18} />
          </button>
        </div>

        {analyse ? (
          <>
            <div className="card">
              <h2 className="card-title">📊 Analyse IA</h2>

              <div className="split-2">
                <div>
                  <label>Catégorie</label>
                  <div className="badge badge-info">{analyse.category}</div>
                </div>

                <div>
                  <label>Urgence</label>
                  <div className={`badge ${analyse.urgency === "haute" ? "badge-danger" : "badge-success"}`}>
                    {analyse.urgency}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label>Résumé</label>
                <p style={{ marginTop: 6, opacity: 0.9 }}>{analyse.summary}</p>
              </div>
            </div>

            <div className="card">
              <h2 className="card-title">✍️ Réponse</h2>

              <div className="form-group">
                <label>Objet</label>
                <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} />
              </div>

              <div className="form-group">
                <label>Corps</label>
                <textarea rows={10} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-success" onClick={handleSendEmail} disabled={isSending}>
                  {isSending ? "Envoi..." : "Envoyer"} <Send size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="card muted-card">
            <div style={{ opacity: 0.85 }}>
              Lance une analyse pour voir apparaître l’analyse IA + la réponse à envoyer.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
