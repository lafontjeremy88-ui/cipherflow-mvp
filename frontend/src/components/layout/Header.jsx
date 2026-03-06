import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Plus } from "lucide-react";
import Button from "../ui/Button";

const PAGE_TITLES = {
  "/dashboard": "Tableau de bord",
  "/emails/history": "Historique des emails",
  "/emails/analyze": "Analyse d'email",
  "/documents": "Vérification de documents",
  "/tenant-files": "Dossiers locataires",
  "/settings": "Paramètres",
  "/account": "Mon compte",
};

const NEW_ACTIONS = {
  "/emails/analyze": { label: "Nouvel email", href: "/emails/analyze" },
  "/tenant-files": { label: "Nouveau dossier", href: "/tenant-files" },
  "/documents": { label: "Analyser un document", href: "/documents" },
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();

  const title = PAGE_TITLES[location.pathname] || "CipherFlow";
  const action = NEW_ACTIONS[location.pathname];

  return (
    <header className="h-16 bg-white border-b border-surface-border flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>

      <div className="flex items-center gap-3">
        <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-ink-secondary hover:bg-surface-muted transition-all duration-150">
          <Bell size={18} />
        </button>

        {action && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(action.href)}
          >
            <Plus size={15} />
            {action.label}
          </Button>
        )}
      </div>
    </header>
  );
}
