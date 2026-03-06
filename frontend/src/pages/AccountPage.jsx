import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Mail, Shield, Key, Trash2, CheckCircle,
  AlertCircle, Settings, Loader2
} from "lucide-react";

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

  const navigate = useNavigate();

  const inputCls = "w-full px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] placeholder-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] focus:bg-white transition-all duration-200";

  const initials = (data?.email || data?.first_name || "?")[0].toUpperCase();

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-[#94A3B8]" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-16 space-y-6">

      {/* Titre */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Mon Compte</h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Gérez vos informations personnelles et la sécurité de votre compte.
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-[#F1F5F9] p-1 rounded-lg w-fit">
        <button
          className="px-4 py-2 text-sm font-medium rounded-md text-[#475569] hover:text-[#0F172A] transition-all duration-200"
          onClick={() => navigate('/settings')}
        >
          Général
        </button>
        <button className="px-4 py-2 text-sm font-medium rounded-md bg-white shadow-sm text-[#0F172A] transition-all duration-200">
          Mon Compte
        </button>
      </div>

      {/* Alertes globales */}
      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl">
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}
      {err && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          <AlertCircle size={16} /> {err}
        </div>
      )}

      {/* ── SECTION PROFIL ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">Profil</h2>
            <p className="text-xs text-[#94A3B8]">Vos informations personnelles</p>
          </div>
        </div>

        <div className="px-6 py-5">
          {/* Avatar + infos */}
          <div className="flex items-center gap-5 mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2563EB] to-[#0EA5A4] flex items-center justify-center text-white text-xl font-bold shadow-sm flex-shrink-0">
              {initials}
            </div>
            <div>
              <p className="text-base font-semibold text-[#0F172A]">{fullName || data?.email || "—"}</p>
              <p className="text-sm text-[#94A3B8]">{data?.email}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
                  <CheckCircle className="h-3 w-3" /> Compte vérifié
                </span>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-700 text-xs font-medium rounded-full border border-violet-200">
                    Admin
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Formulaire */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-2 uppercase tracking-wide">Nom complet</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Prénom Nom"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-2 uppercase tracking-wide">Rôle</label>
              <input type="text" value={data?.role || ""} readOnly className={inputCls + " opacity-60 cursor-not-allowed"} />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between">
          <button
            className="text-sm text-[#94A3B8] hover:text-[#475569] transition-colors"
            onClick={load}
            disabled={saving}
          >
            Recharger
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-medium rounded-lg transition-all duration-200 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
        </div>
      </div>

      {/* ── SECTION EMAIL & CONNEXION ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
          <div className="p-2 bg-teal-50 rounded-lg">
            <Mail className="h-4 w-4 text-teal-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">Email & Connexion</h2>
            <p className="text-xs text-[#94A3B8]">Méthode d'authentification utilisée</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-3">
          {/* Email principal */}
          <div className="flex items-center justify-between p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white border border-[#E2E8F0] rounded-lg">
                <Mail className="h-4 w-4 text-[#475569]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0F172A]">{data?.email || "—"}</p>
                <p className="text-xs text-[#94A3B8]">Email principal du compte</p>
              </div>
            </div>
            <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-200">
              Vérifié
            </span>
          </div>

          {/* Membre depuis */}
          <div className="flex items-center justify-between p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white border border-[#E2E8F0] rounded-lg">
                <Key className="h-4 w-4 text-[#475569]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0F172A]">Membre depuis</p>
                <p className="text-xs text-[#94A3B8]">
                  {data?.created_at ? new Date(data.created_at).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
              {data?.account_status || "actif"}
            </span>
          </div>
        </div>
      </div>

      {/* ── SECTION SÉCURITÉ ── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center gap-3">
          <div className="p-2 bg-violet-50 rounded-lg">
            <Shield className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">Sécurité</h2>
            <p className="text-xs text-[#94A3B8]">Gérez l'accès à votre compte</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-3">
          {/* Réinitialisation mot de passe */}
          <div className="flex items-center justify-between p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
            <div>
              <p className="text-sm font-medium text-[#0F172A]">Changer mon mot de passe</p>
              <p className="text-xs text-[#94A3B8]">Un lien sera envoyé à <strong>{data?.email}</strong></p>
            </div>
            <button
              onClick={onRequestPasswordReset}
              disabled={pwdLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#E2E8F0] text-xs font-medium text-[#475569] rounded-lg hover:border-[#2563EB] hover:text-[#2563EB] transition-all duration-200 disabled:opacity-50"
            >
              {pwdLoading ? <Loader2 size={13} className="animate-spin" /> : null}
              {pwdLoading ? "Envoi…" : "Envoyer le lien"}
            </button>
          </div>
          {pwdMsg.text && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${pwdMsg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {pwdMsg.type === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
              {pwdMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* ── ZONE DANGEREUSE ── */}
      <div className="bg-white border border-red-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-red-100 flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-lg">
            <Trash2 className="h-4 w-4 text-red-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-red-700">Zone de danger</h2>
            <p className="text-xs text-red-400">Actions irréversibles</p>
          </div>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
            <div>
              <p className="text-sm font-medium text-red-800">Supprimer mon compte</p>
              <p className="text-xs text-red-400 mt-0.5">Cette action est permanente et irréversible.</p>
            </div>
            <button
              onClick={onDeleteAccount}
              className="px-4 py-2 bg-white border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200"
            >
              Supprimer
            </button>
          </div>
        </div>
      </div>

      {/* RGPD */}
      <p className="text-center text-xs text-[#94A3B8]">
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#475569] transition-colors">
          Politique de confidentialité
        </a>
        {" · "}
        <a href="/mentions-legales" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#475569] transition-colors">
          Mentions légales
        </a>
      </p>
    </div>
  );
}
