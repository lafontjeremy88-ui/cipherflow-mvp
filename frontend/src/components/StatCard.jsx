// frontend/src/components/StatCard.jsx
import React from "react";

/**
 * StatCard (Design System)
 * - Style via classes : card + kpi-card
 * - Accent via CSS variable (--accent)
 * - Accessible si cliquable (Enter / Space)
 */
export default function StatCard({ title, value, icon: Icon, color, onClick }) {
  const isClickable = typeof onClick === "function";

  function onKeyDown(e) {
    if (!isClickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className={`card kpi-card ${isClickable ? "is-clickable" : ""}`}
      style={color ? { "--accent": color } : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={onKeyDown}
      title={isClickable ? "Cliquer pour ouvrir" : undefined}
    >
      <div className="kpi-icon">
        {Icon ? <Icon size={22} color={color || "currentColor"} /> : null}
      </div>

      <div className="kpi-content">
        <div className="kpi-title">{title}</div>
        <div className="kpi-value">{value}</div>
      </div>
    </div>
  );
}
