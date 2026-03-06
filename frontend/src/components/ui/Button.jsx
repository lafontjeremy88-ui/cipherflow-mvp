import React from "react";

const variants = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 border-transparent focus:ring-primary-600/30",
  secondary: "bg-white text-ink border border-surface-border hover:bg-surface-bg focus:ring-primary-600/20",
  ghost: "text-ink-secondary hover:bg-surface-muted border-transparent focus:ring-primary-600/20",
  danger: "bg-red-50 text-red-600 hover:bg-red-100 border-red-200 focus:ring-red-500/20",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  onClick,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium border",
        "transition-all duration-200 ease-in-out",
        "focus:outline-none focus:ring-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "hover:scale-[1.02] active:scale-[0.98]",
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
