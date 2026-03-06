import React from "react";

const variants = {
  success: "bg-green-50 text-green-700 border border-green-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  danger: "bg-red-50 text-red-700 border border-red-200",
  info: "bg-blue-50 text-blue-700 border border-blue-200",
  neutral: "bg-slate-50 text-slate-600 border border-slate-200",
  violet: "bg-violet-50 text-violet-700 border border-violet-200",
};

export default function Badge({ children, variant = "neutral", className = "" }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full",
        variants[variant] || variants.neutral,
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
