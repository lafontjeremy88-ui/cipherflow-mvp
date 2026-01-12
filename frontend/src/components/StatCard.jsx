// frontend/src/components/StatCard.jsx
import React from "react";

/**
 * StatCard
 * - Affiche une carte KPI (titre + valeur + icône optionnelle)
 * - Si onClick est fourni, la carte devient cliquable (cursor + role + accessibilité)
 *
 * Props:
 * - title: string
 * - value: string|number
 * - icon: React component (optionnel)
 * - color: string (couleur de l'accent à gauche)
 * - onClick: function (optionnel) => rend la card cliquable
 */
const StatCard = ({ title, value, icon: Icon, color, onClick }) => {
  const isClickable = typeof onClick === "function";

  return (
    <div
      className="card"
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              // Accessibilité : Enter ou Space déclenche le click
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      style={{
        padding: "1.5rem",
        marginBottom: 0,
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        borderLeft: `4px solid ${color}`,
        cursor: isClickable ? "pointer" : "default",
        userSelect: "none",
      }}
      title={isClickable ? "Cliquer pour ouvrir" : undefined}
    >
      <div
        style={{
          backgroundColor: `${color}20`,
          padding: "10px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* On vérifie que Icon existe avant de l'afficher pour éviter un crash */}
        {Icon && <Icon size={24} color={color} />}
      </div>

      <div>
        <h4
          style={{
            margin: 0,
            color: "var(--text-secondary)",
            fontSize: "0.85rem",
            textTransform: "uppercase",
          }}
        >
          {title}
        </h4>

        <span
          style={{
            fontSize: "1.8rem",
            fontWeight: "bold",
            color: "var(--text-primary)",
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
};

export default StatCard;
