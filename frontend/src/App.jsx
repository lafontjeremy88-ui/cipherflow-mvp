import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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
} from "lucide-react";

import Login from "./components/Login";
import Register from "./components/Register";
import FileAnalyzer from "./components/FileAnalyzer";
import TenantFilesPanel from "./components/TenantFilesPanel";
import InvoiceGenerator from "./components/InvoiceGenerator";
import EmailHistory from "./components/EmailHistory";
import SettingsPanel from "./components/SettingsPanel";
import OAuthCallback from "./pages/OAuthCallback";

const API_BASE = "https://cipherflow-mvp-production.up.railway.app";
const LS_TOKEN = "cipherflow_token";
const LS_EMAIL = "cipherflow_email";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(LS_TOKEN));
  const [userEmail, setUserEmail] = useState(localStorage.getItem(LS_EMAIL));
  const [showRegister, setShowRegister] = useState(false);

  const handleAuthSuccess = (newToken, email) => {
    localStorage.setItem(LS_TOKEN, newToken);
    localStorage.setItem(LS_EMAIL, email);
    setToken(newToken);
    setUserEmail(email);
  };

  const handleLogout = () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_EMAIL);
    setToken(null);
    setUserEmail(null);
  };

  return (
    <Routes>
      {/* Callback Google OAuth */}
      <Route
        path="/oauth/callback"
        element={<OAuthCallback onAuthSuccess={handleAuthSuccess} />}
      />

      {/* Login/Register */}
      <Route
        path="/auth"
        element={
          <AppShell token={token}>
            {showRegister ? (
              <Register
                onSuccess={() => setShowRegister(false)}
                onGoLogin={() => setShowRegister(false)}
              />
            ) : (
              <Login
                onAuthSuccess={handleAuthSuccess}
                onGoRegister={() => setShowRegister(true)}
              />
            )}
          </AppShell>
        }
      />

      {/* App */}
      <Route
        path="/*"
        element={
          token ? (
            <MainApp token={token} userEmail={userEmail} onLogout={handleLogout} />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
    </Routes>
  );
}

function AppShell({ token, children }) {
  if (token) return <Navigate to="/" replace />;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0f172a",
        padding: "20px",
      }}
    >
      <div style={{ marginBottom: "20px", textAlign: "center" }}>
        <Zap size={40} color="#6366f1" />
        <h1 style={{ color: "white", fontSize: "1.5rem", marginTop: "10px" }}>
          CipherFlow V2
        </h1>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "#1e293b",
          padding: "2rem",
          borderRadius: "16px",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function MainApp({ token, userEmail, onLogout }) {
  const [activeTab, setActiveTab] = useState("dashboard");

  // Documents sub-view (analyse docs / dossiers locataires)
  const [documentsView, setDocumentsView] = useState("analyze"); // "analyze" | "tenants"

  // Dashboard stats
  const [stats, setStats] = useState({
    processed_emails: 0,
    high_urgency: 0,
    generated_invoices: 0,
    categories: [],
    recent_activity: [],
  });

  // History
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);

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

  useEffect(() => {
    if (activeTab !== "analyze") {
      setAnalyse(null);
      setAnalysisId(null);
      setInfoMessage("");
      setErrorMessage("");
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "documents") {
      setDocumentsView("analyze");
    }
  }, [activeTab]);

  /**
   * authFetch:
   * - Ajoute automatiquement Authorization Bearer <token>
   * - Ajoute Content-Type: application/json seulement si body n'est PAS un FormData
   */
  const authFetch = async (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);

    const isFormData = options.body instanceof FormData;
    if (!isFormData && options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      // Token expiré ou invalide -> logout pour éviter boucle infinie
      onLogout?.();
      throw new Error("Session expirée. Merci de vous reconnecter.");
    }

    return res;
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await authFetch(`${API_BASE}/dashboard/stats`);
      if (!res.ok) throw new Error("Erreur récupération stats dashboard");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      // On ne bloque pas tout si le dashboard échoue
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnalyzeEmail = async () => {
    try {
      setIsAnalyzing(true);
      setErrorMessage("");
      setInfoMessage("");

      const res = await authFetch(`${API_BASE}/email/process`, {
        method: "POST",
        body: JSON.stringify({
          sender_email: fromEmail,
          subject,
          body: content,
        }),
      });

      if (!res.ok) throw new Error("Erreur analyse email");

      const data = await res.json();
      setAnalyse(data);
      setAnalysisId(data?.id || data?.email_id || null);

      setReplySubject(`RE: ${subject}`);
      setReplyBody(data?.suggested_response_text || "");

      setInfoMessage("Analyse terminée ✅");

      // refresh dashboard
      fetchDashboardStats();
    } catch (err) {
      setErrorMessage(err.message || "Erreur inconnue");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendEmail = async () => {
    try {
      if (!analysisId) throw new Error("Aucun email analysé à envoyer.");

      setIsSending(true);
      setErrorMessage("");
      setInfoMessage("");

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

      // refresh dashboard
      fetchDashboardStats();
    } catch (err) {
      setErrorMessage(err.message || "Erreur inconnue");
    } finally {
      setIsSending(false);
    }
  };

  const handleNavigation = (tabName, id = null) => {
    if (id) setSelectedHistoryId(id);
    setActiveTab(tabName);
  };

  const handleSidebarClick = (tabName) => {
    setSelectedHistoryId(null);
    setActiveTab(tabName);
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Zap size={22} />
          <h2>CipherFlow V2</h2>
        </div>

        <div className="user-info">
          <div className="user-icon">
            <User size={18} />
          </div>
          <div className="user-details">
            <div className="user-status">Connecté</div>
            <div className="user-email">{userEmail || "admin@cipherflow.com"}</div>
          </div>
        </div>

        <div className="nav">
          <div
            className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => handleSidebarClick("dashboard")}
          >
            <LayoutDashboard size={20} /> <span>Vue d&apos;ensemble</span>
          </div>

          <div
            className={`nav-item ${activeTab === "analyze" ? "active" : ""}`}
            onClick={() => handleSidebarClick("analyze")}
          >
            <Mail size={20} /> <span>Traitement Email</span>
          </div>

          <div
            className={`nav-item ${activeTab === "invoices" ? "active" : ""}`}
            onClick={() => handleSidebarClick("invoices")}
          >
            <FileText size={20} /> <span>Quittances & Loyers</span>
          </div>

          <div
            className={`nav-item ${activeTab === "documents" ? "active" : ""}`}
            onClick={() => handleSidebarClick("documents")}
          >
            <FolderSearch size={20} /> <span>Dossiers Locataires</span>
          </div>

          <div
            className={`nav-item ${activeTab === "history" ? "active" : ""}`}
            onClick={() => handleSidebarClick("history")}
          >
            <History size={20} /> <span>Historique</span>
          </div>

          <div
            className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => handleSidebarClick("settings")}
          >
            <Settings size={20} /> <span>Paramètres</span>
          </div>

          <div className="nav-item logout" onClick={onLogout}>
            <LogOut size={20} /> <span>Déconnexion</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.8rem", fontWeight: "bold" }}>
            {activeTab === "dashboard" && "Tableau de Bord"}
            {activeTab === "analyze" && "Traitement Intelligent"}
            {activeTab === "invoices" && "Générateur de Quittances"}
            {activeTab === "documents" && "Analyse de Documents"}
            {activeTab === "history" && "Historique des Activités"}
            {activeTab === "settings" && "Paramètres du SaaS"}
          </h1>
        </header>

        {errorMessage && (
          <div
            style={{
              backgroundColor: "rgba(239,68,68,0.2)",
              color: "rgb(252,165,165)",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1rem",
              display: "flex",
              gap: "10px",
            }}
          >
            <AlertCircle size={20} /> {errorMessage}
          </div>
        )}

        {infoMessage && (
          <div
            style={{
              backgroundColor: "rgba(34,197,94,0.2)",
              color: "rgb(134,239,172)",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1rem",
              display: "flex",
              gap: "10px",
            }}
          >
            <CheckCircle size={20} /> {infoMessage}
          </div>
        )}

        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="dashboard">
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-icon">
                  <Mail size={18} />
                </div>
                <div className="kpi-value">{stats.processed_emails ?? 0}</div>
                <div className="kpi-label">Emails Traités</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon warning">
                  <AlertCircle size={18} />
                </div>
                <div className="kpi-value">{stats.high_urgency ?? 0}</div>
                <div className="kpi-label">Urgence Haute</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-icon success">
                  <FileText size={18} />
                </div>
                <div className="kpi-value">{stats.generated_invoices ?? 0}</div>
                <div className="kpi-label">Quittances Générées</div>
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="card">
                <h3 style={{ marginBottom: "1rem", display: "flex", gap: 8, alignItems: "center" }}>
                  <PieChart size={18} /> Répartition par Catégorie
                </h3>

                {/* Ici tu peux garder ton composant donut existant si tu en as un.
                    Sinon, on affiche juste une liste simple. */}
                <div style={{ opacity: 0.9 }}>
                  {(stats.categories || []).length === 0 ? (
                    <p style={{ opacity: 0.7 }}>Aucune donnée.</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {stats.categories.map((c, idx) => (
                        <li key={idx}>
                          {c.name}: {c.value}%
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginBottom: "1rem" }}>📈 Activité Récente</h3>
                {(stats.recent_activity || []).length === 0 ? (
                  <p style={{ opacity: 0.7 }}>Aucune activité récente.</p>
                ) : (
                  <div className="recent-activity">
                    {stats.recent_activity.map((a, idx) => (
                      <div
                        key={idx}
                        className="activity-item"
                        onClick={() => handleNavigation("history", a.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="activity-dot" />
                        <div className="activity-text">
                          <div className="activity-title">{a.subject}</div>
                          <div className="activity-meta">
                            {a.category} • {a.created_at}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ANALYZE EMAIL */}
        {activeTab === "analyze" && (
          <div className="card">
            <h2 style={{ marginBottom: "1rem" }}>📩 Email du Client</h2>

            <div className="form-group">
              <label>Expéditeur</label>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Sujet</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Contenu</label>
              <textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
            </div>

            <button className="btn btn-primary" onClick={handleAnalyzeEmail} disabled={isAnalyzing}>
              {isAnalyzing ? "Analyse..." : "Analyser ⚡"}
            </button>

            {analyse && (
              <div style={{ marginTop: "2rem" }}>
                <div className="card" style={{ marginBottom: "1rem" }}>
                  <h3 style={{ marginBottom: "1rem" }}>🔎 Résultat</h3>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div className="pill">
                      <span>Catégorie:</span> <strong>{analyse.category}</strong>
                    </div>
                    <div className="pill">
                      <span>Urgence:</span>{" "}
                      <div className={`urgency-badge urgency-${analyse.urgency?.toLowerCase()}`}>
                        {analyse.urgency}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "1rem" }}>
                    <label>Résumé</label>
                    <p>{analyse.summary}</p>
                  </div>
                </div>

                <div className="card">
                  <h3 style={{ marginBottom: "1rem" }}>✍️ Réponse</h3>

                  <div className="form-group">
                    <label>Sujet</label>
                    <input
                      type="text"
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Réponse</label>
                    <textarea
                      rows={8}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                    />
                  </div>

                  <button className="btn btn-success" onClick={handleSendEmail} disabled={isSending}>
                    {isSending ? "Envoi..." : "Valider & Envoyer ✅"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* INVOICES */}
        {activeTab === "invoices" && (
          <div>
            <InvoiceGenerator token={token} authFetch={authFetch} />
          </div>
        )}

        {/* DOCUMENTS (2 vues) */}
        {activeTab === "documents" && (
          <div>
            <div
              style={{
                display: "flex",
                gap: "10px",
                marginBottom: "16px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => setDocumentsView("analyze")}
                className="btn btn-primary"
                style={{ opacity: documentsView === "analyze" ? 1 : 0.6 }}
              >
                Analyse documents
              </button>

              <button
                onClick={() => setDocumentsView("tenants")}
                className="btn btn-primary"
                style={{ opacity: documentsView === "tenants" ? 1 : 0.6 }}
              >
                Dossiers locataires
              </button>
            </div>

            {documentsView === "analyze" && <FileAnalyzer token={token} authFetch={authFetch} />}

            {documentsView === "tenants" && (
              <TenantFilesPanel authFetch={authFetch} apiBase={API_BASE} />
            )}
          </div>
        )}

        {/* HISTORY */}
        {activeTab === "history" && (
          <EmailHistory token={token} initialId={selectedHistoryId} authFetch={authFetch} />
        )}

        {/* SETTINGS */}
        {activeTab === "settings" && <SettingsPanel token={token} authFetch={authFetch} />}
      </main>
    </div>
  );
}
