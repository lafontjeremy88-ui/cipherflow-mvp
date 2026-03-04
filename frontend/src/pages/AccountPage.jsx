import React, { useEffect, useMemo, useState } from "react";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function AccountPage({ authFetch }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [data, setData] = useState(null);

  const [fullName, setFullName] = useState("");

  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState({ type: "", text: "" });

  const isAdmin = useMemo(() => {
    const r = String(data?.role || "").toLowerCase();
    return r.includes("agency_admin") || r.includes("super_admin");
  }, [data?.role]);

  const load = async () => {
    setErr("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const res = await authFetch("/account/me");
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.detail || "Erreur chargement compte");
      setData(json);
      setFullName([json?.first_name, json?.last_name].filter(Boolean).join(" "));
    } catch (e) {
      setErr(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSave = async () => {
    setErr("");
    setSuccessMsg("");
    setSaving(true);
    try {
      const parts = fullName.trim().split(/\s+/);
      const payload = {
        first_name: parts[0] || "",
        last_name:  parts.slice(1).join(" ") || "",
      };

      const res = await authFetch("/account/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.detail || "Erreur sauvegarde");

      setData(json);
      setSuccessMsg("Modifications enregistrées.");
      window.setTimeout(() => setSuccessMsg(""), 3000);
    } catch (e) {
      setErr(e.message || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  const onRequestPasswordReset = async () => {
    if (!data?.email) return;
    setPwdLoading(true);
    setPwdMsg({ type: "", text: "" });
    try {
      const res = await authFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: data.email }),
      });
      if (res.ok) {
        setPwdMsg({ type: "success", text: "Email de réinitialisation envoyé à " + data.email });
      } else {
        const json = await res.json().catch(() => null);
        setPwdMsg({ type: "error", text: json?.detail || "Erreur lors de l'envoi." });
      }
    } catch {
      setPwdMsg({ type: "error", text: "Erreur réseau." });
    } finally {
      setPwdLoading(false);
    }
  };

  const onDeleteAccount = async () => {
    setErr("");
    setSuccessMsg("");
    const ok = window.confirm(
      "Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible."
    );
    if (!ok) return;
    try {
      const res = await authFetch("/account/me?mode=purge", { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.detail || "Erreur suppression du compte");
      localStorage.clear();
      window.location.href = "/login";
    } catch (e) {
      setErr(e.message || "Erreur");
    }
  };

  if (loading) {
    return (
      <div className="card">
        <h2>Mon compte</h2>
        <div className="muted">Chargement…</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 720 }}>
      {/* En-tête */}
      <div>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Mon compte</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Gérez vos informations personnelles et la sécurité de votre compte.
        </p>
      </div>

      {successMsg && <div className="alert alert-success">{successMsg}</div>}
      {err        && <div className="alert alert-error">{err}</div>}

      {/* ── Informations ────────────────────────────────────────── */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Informations</h3>

        <div className="form-grid">
          <div className="field">
            <label>Email</label>
            <input value={data?.email || ""} readOnly />
          </div>

          <div className="field">
            <label>Rôle</label>
            <input value={data?.role || ""} readOnly />
          </div>

          <div className="field">
            <label>État du compte</label>
            <input value={data?.account_status || ""} readOnly />
          </div>

          <div className="field">
            <label>Membre depuis</label>
            <input
              value={
                data?.created_at
                  ? new Date(data.created_at).toLocaleDateString("fr-FR")
                  : ""
              }
              readOnly
            />
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Nom complet</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Prénom Nom"
            />
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button
            className={cx("btn btn-primary", saving && "disabled")}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </button>
          <button className="btn btn-ghost" onClick={load} disabled={saving}>
            Recharger
          </button>
        </div>
      </div>

      {/* ── Sécurité ─────────────────────────────────────────────── */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sécurité</h3>
        <p className="muted" style={{ marginBottom: 14, fontSize: 14 }}>
          Vous recevrez un lien de réinitialisation à{" "}
          <strong>{data?.email}</strong>.
        </p>
        <button
          className="btn btn-ghost"
          onClick={onRequestPasswordReset}
          disabled={pwdLoading}
        >
          {pwdLoading ? "Envoi…" : "Changer mon mot de passe"}
        </button>
        {pwdMsg.text && (
          <div
            className={pwdMsg.type === "success" ? "alert alert-success" : "alert alert-error"}
            style={{ marginTop: 12 }}
          >
            {pwdMsg.text}
          </div>
        )}
      </div>

      {/* ── Zone dangereuse ──────────────────────────────────────── */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Zone dangereuse</h3>
        <p className="muted" style={{ marginBottom: 14, fontSize: 14 }}>
          La suppression est <strong>irréversible</strong> et entraîne la
          perte de toutes vos données.
        </p>
        <button
          className="btn btn-ghost"
          style={{ borderColor: "#f87171", color: "#f87171" }}
          onClick={onDeleteAccount}
        >
          Supprimer mon compte
        </button>
      </div>

      {/* RGPD discret */}
      <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 0 }}>
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "underline" }}
        >
          Politique de confidentialité
        </a>
        {" · "}
        <a
          href="/mentions-legales"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "underline" }}
        >
          Mentions légales
        </a>
      </p>
    </div>
  );
}
