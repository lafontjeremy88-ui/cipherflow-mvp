import React from "react";

const paddings = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export default function Card({ children, className = "", padding = "md", onClick }) {
  const isClickable = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      className={[
        "bg-white rounded-xl border border-surface-border shadow-card",
        "transition-all duration-200 ease-in-out",
        isClickable ? "cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5" : "hover:shadow-card-hover",
        paddings[padding] || paddings.md,
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
