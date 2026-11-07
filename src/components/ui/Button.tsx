"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline" | "action";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white border-ui border-line shadow-ui hover:shadow-ui-sm hover:press-sm active:shadow-none active:press",
  secondary:
    "bg-white text-ink border-ui border-line shadow-ui hover:shadow-ui-sm hover:press-sm active:shadow-none active:press",
  danger:
    "bg-danger text-white border-ui border-line shadow-ui hover:shadow-ui-sm hover:press-sm active:shadow-none active:press",
  ghost:
    "bg-transparent text-primary border-ui border-transparent hover:border-line hover:shadow-ui",
  action:
    "bg-white text-ink border-ui border-line hover:border-primary hover:text-primary",
  outline:
    "bg-white text-primary border-ui border-primary shadow-ui-brand hover:shadow-ui-brand-sm hover:press-sm active:shadow-none active:press",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center rounded-button justify-center font-bold case-ui tracking-ui transition-all focus:outline-none focus-visible:outline-[3px] focus-visible:outline-focus disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:press-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
