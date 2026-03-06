import React from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Mail,
  BarChart2,
  FileText,
  FolderOpen,
  Settings,
  LogOut,
  UserCircle,
} from "lucide-react";
import { getEmail } from "../../services/api";

function NavItem({ to, icon: Icon, label, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
          isActive
            ? "bg-primary-50 text-primary-600 font-medium"
            : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
        ].join(" ")
      }
    >
      {Icon && <Icon size={18} />}
      {label}
    </NavLink>
  );
}

function NavSubItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 ml-7 px-3 py-2 rounded-lg text-xs transition-all duration-150",
          isActive
            ? "bg-primary-50 text-primary-600 font-medium"
            : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
        ].join(" ")
      }
    >
      {Icon && <Icon size={15} />}
      {label}
    </NavLink>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold text-ink-tertiary uppercase tracking-wider px-3 mb-1 mt-5">
      {children}
    </p>
  );
}

export default function Sidebar({ onLogout }) {
  const email = getEmail();
  const initials = email ? email[0].toUpperCase() : "?";

  return (
    <aside className="w-[260px] flex-shrink-0 h-screen bg-white border-r border-surface-border flex flex-col overflow-hidden">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="CipherFlow"
            className="h-8 w-8 object-contain flex-shrink-0"
          />
          <div>
            <p className="font-bold text-sm text-ink">CipherFlow</p>
            <p className="text-xs text-ink-tertiary">Automatisation immobilière</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <SectionLabel>Navigation</SectionLabel>

        <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
        <NavItem to="/emails/history" icon={Mail} label="Emails" />
        <NavItem to="/emails/analyze" icon={BarChart2} label="Analyse" />
        <NavItem to="/documents" icon={FileText} label="Documents" />
        <NavItem to="/tenant-files" icon={FolderOpen} label="Dossiers locataires" />

        <SectionLabel>Système</SectionLabel>
        <NavItem to="/settings" icon={Settings} label="Paramètres" />
        <NavItem to="/account" icon={UserCircle} label="Mon Compte" />
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 border-t border-surface-border pt-3">
        {email && (
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600 font-bold text-sm flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink truncate">{email}</p>
              <p className="text-xs text-ink-tertiary">Connecté</p>
            </div>
          </div>
        )}

        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-ink-secondary hover:bg-red-50 hover:text-red-600 transition-all duration-150"
        >
          <LogOut size={16} />
          Se déconnecter
        </button>

        <div className="px-3 mt-3 pt-3 border-t border-surface-border">
          <p className="text-[10px] text-ink-tertiary leading-relaxed">
            Données protégées —{" "}
            <Link to="/privacy" className="underline hover:text-ink-secondary">
              Confidentialité
            </Link>{" "}
            ·{" "}
            <Link to="/mentions-legales" className="underline hover:text-ink-secondary">
              Mentions légales
            </Link>
          </p>
        </div>
      </div>
    </aside>
  );
}
