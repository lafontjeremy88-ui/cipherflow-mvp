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
        "bg-white rounded-xl border border-surface-border shadow-card p-5",
        "transition-all duration-200 ease-in-out",
        isClickable
          ? "cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5"
          : "hover:shadow-card-hover",
      ].join(" ")}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-[#475569]">{label}</span>
        {Icon && (
          <div
            className={`p-2 rounded-lg flex items-center justify-center ${colors.bg} ${colors.icon} flex-shrink-0`}
          >
            <Icon size={16} />
          </div>
        )}
      </div>
      <div className="text-3xl font-bold text-[#0F172A] mb-1">
        {value ?? 0}
      </div>
      {sublabel && (
        <div className="text-xs text-[#94A3B8]">{sublabel}</div>
      )}
    </div>
  );
}
