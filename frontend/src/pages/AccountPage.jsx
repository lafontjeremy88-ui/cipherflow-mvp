import React, { useEffect, useMemo, useState } from "react";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function AccountPage({ authFetch }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // ✅ NEW: message succès
  const [successMsg, setSuccessMsg] = useState("");

  const [data, setData] = useState(null);

  // form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("fr");

  const isAdmin = useMemo(() => {
    const r = String(data?.role || "").toLowerCase();
    return r.includes("agency_admin") || r.includes("super_admin");
  }, [data?.role]);

  const load = async () => {
    setErr("");
    setSuccessMsg(""); // ✅ NEW: reset message
    setLoading(true);
    try {
      const res = await authFetch("/account/me");
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.detail || "Erreur chargement compte");

      setData(json);
      setFirstName(json?.first_name || "");
      setLastName(json?.last_name || "");
      setAgencyName(json?.agency_name || "");
      setPreferredLanguage((json?.preferred_language || "fr").toLowerCase());
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
    setSuccessMsg(""); // ✅ NEW: reset message
    setSaving(true);
    try {
      const payload = {
        first_name: firstName,
        last_name: lastName,
        preferred_language: preferredLanguage,
      };

      if (isAdmin) payload.agency_name = agencyName;

      const res = await authFetch("/account/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.detail || "Erreur sauvegarde");

      setData(json);

      // ✅ NEW: success toast/message
      setSuccessMsg("Modifications enregistrées avec succès.");
      window.setTimeout(() => setSuccessMsg(""), 3000);
    } catch (e) {
      setErr(e.message || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  // ✅ NEW: delete account (soft delete côté backend)
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

      // Déconnexion + retour login
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
    <div style={{ display: "grid", gap: 16, maxWidth: 900 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Mon compte</h2>

        {/* ✅ NEW: success message */}
        {successMsg ? <div className="alert alert-success">{successMsg}</div> : null}

        {err ? <div className="alert alert-error">{err}</div> : null}
      </div>

      {/* 1) Informations du compte */}
      <div className="card">
        <h3>Informations</h3>

        <div className="form-grid">
          <div className="field">
            <label>Email (lecture seule)</label>
            <input value={data?.email || ""} readOnly />
          </div>

          <div className="field">
            <label>Rôle (lecture seule)</label>
            <input value={data?.role || ""} readOnly />
          </div>

          <div className="field">
            <label>Prénom</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>

          <div className="field">
            <label>Nom</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Agence / Organisation {isAdmin ? "" : "(lecture seule)"}</label>
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              readOnly={!isAdmin}
            />
            {!isAdmin ? (
              <div className="muted small" style={{ marginTop: 6 }}>
                Seul un admin peut modifier le nom de l’agence.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 2) Préférences */}
      <div className="card">
        <h3>Préférences</h3>

        <div className="form-grid">
          <div className="field">
            <label>Langue</label>
            <select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
            <div className="muted small" style={{ marginTop: 6 }}>
              Placeholder : la traduction UI viendra plus tard.
            </div>
          </div>

          <div className="field">
            <label>Préférences UI</label>
            <input value="(placeholder)" readOnly />
          </div>
        </div>
      </div>

      {/* 3) Statut */}
      <div className="card">
        <h3>Statut du compte</h3>

        <div className="form-grid">
          <div className="field">
            <label>Date de création</label>
            <input
              value={data?.created_at ? new Date(data.created_at).toLocaleString() : ""}
              readOnly
            />
          </div>

          <div className="field">
            <label>État</label>
            <input value={data?.account_status || ""} readOnly />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button className={cx("btn", saving && "disabled")} onClick={onSave} disabled={saving}>
          {saving ? "Sauvegarde…" : "Enregistrer"}
        </button>
        <button className="btn btn-ghost" onClick={load} disabled={saving}>
          Recharger
        </button>
      </div>

            {/* ✅ Bloc RGPD / infos légales */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Protection des données</h3>

        <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          CipherFlow traite tes données conformément à sa{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "underline" }}
          >
            Politique de confidentialité
          </a>.
        </p>

        <p className="muted" style={{ fontSize: 12, opacity: 0.8 }}>
          Tu peux consulter cette page à tout moment pour connaître le détail
          des traitements et de tes droits (accès, suppression, portabilité…).
        </p>
      </div>

      {/* ✅ Zone dangereuse */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0, color: "#f97373" }}>Zone dangereuse</h3>

        <div className="muted" style={{ marginBottom: 10 }}>
          Supprimer ton compte te déconnecte immédiatement.
          <br />
          Cette action est <strong>irréversible</strong>.
        </div>

        <button
          className="btn"
          onClick={onDeleteAccount}
          disabled={saving}
        >
          Supprimer mon compte
        </button>
      </div>

    </div>
  );
}
