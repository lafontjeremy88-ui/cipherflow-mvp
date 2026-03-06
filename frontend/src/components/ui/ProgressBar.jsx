import React from "react";

export default function ProgressBar({ value = 0, label, showPercent = true }) {
  const pct = Math.min(100, Math.max(0, value));

  const fillColor =
    pct >= 80
      ? "bg-green-500"
      : pct >= 50
      ? "bg-primary-600"
      : "bg-orange-400";

  return (
    <div className="w-full">
      {(label || showPercent) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span className="text-xs font-medium text-ink-secondary">{label}</span>
          )}
          {showPercent && (
            <span className="text-sm font-semibold text-ink">{pct}%</span>
          )}
        </div>
      )}
      <div className="bg-surface-border rounded-full h-2 overflow-hidden">
        <div
          className={`${fillColor} rounded-full h-2 transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
