import React from "react";

export default function ActivityItem({ icon: Icon, iconBg = "bg-blue-50", iconColor = "text-blue-600", title, subtitle, time, onClick }) {
  return (
    <div
      onClick={onClick}
      className={[
        "flex items-center gap-3 px-2 -mx-2 py-2 rounded-lg",
        "transition-all duration-150 ease-in-out",
        onClick ? "cursor-pointer hover:bg-surface-bg" : "",
      ].join(" ")}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg} ${iconColor}`}>
        {Icon && <Icon size={16} />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-ink-tertiary truncate">{subtitle}</p>
        )}
      </div>

      {time && (
        <span className="text-xs text-ink-tertiary ml-auto flex-shrink-0">{time}</span>
      )}
    </div>
  );
}
