import React from "react";

const colorMap = {
  blue: {
    bg: "bg-blue-50",
    icon: "text-blue-600",
  },
  teal: {
    bg: "bg-teal-50",
    icon: "text-teal-600",
  },
  violet: {
    bg: "bg-violet-50",
    icon: "text-violet-600",
  },
  orange: {
    bg: "bg-orange-50",
    icon: "text-orange-500",
  },
  green: {
    bg: "bg-green-50",
    icon: "text-green-600",
  },
  red: {
    bg: "bg-red-50",
    icon: "text-red-500",
  },
};

export default function StatCard({
  icon: Icon,
  label,
  title,        // alias legacy pour label
  sublabel,
  value,
  color = "blue",
  onClick,
}) {
  label = label || title;
  const colors = colorMap[color] || colorMap.blue;
  const isClickable = typeof onClick === "function";

  return (
    <div
      onClick={onClick}
      className={[
        "bg-white rounded-xl border border-surface-border shadow-card p-6",
        "transition-all duration-200 ease-in-out",
        isClickable
          ? "cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5"
          : "hover:shadow-card-hover",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-tertiary uppercase mb-1">
            {label}
          </p>
          <p className="text-3xl font-bold text-ink mt-1">{value}</p>
          {sublabel && (
            <p className="text-xs text-ink-tertiary mt-1">{sublabel}</p>
          )}
        </div>
        {Icon && (
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${colors.bg} ${colors.icon} flex-shrink-0`}
          >
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  );
}
