import type { ReactNode } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-ink border-badge border-line",
  success: "bg-primary text-white border-badge border-line",
  warning: "bg-warning text-ink border-badge border-line",
  danger: "bg-danger text-white border-badge border-line",
  info: "bg-info text-white border-badge border-line",
};

export default function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-badge px-2 py-0.5 text-xs font-bold case-ui tracking-ui ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
