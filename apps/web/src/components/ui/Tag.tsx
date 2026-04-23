import type { ReactNode } from "react";

export type TagVariant =
  | "default"
  | "muted"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline";

type TagProps = {
  children: ReactNode;
  variant?: TagVariant;
  size?: "sm" | "md";
  className?: string;
};

const variantClasses: Record<TagVariant, string> = {
  default: "border-tag-neutral-border bg-tag-neutral text-tag-neutral-text",
  muted: "border-tag-muted-border bg-tag-muted text-tag-muted-text",
  accent: "border-tag-accent-border bg-tag-accent text-tag-accent-text",
  success: "border-tag-success-border bg-tag-success text-tag-success-text",
  warning: "border-tag-warning-border bg-tag-warning text-tag-warning-text",
  danger: "border-tag-danger-border bg-tag-danger text-tag-danger-text",
  info: "border-tag-info-border bg-tag-info text-tag-info-text",
  outline: "border-tag-outline-border bg-transparent text-tag-outline-text",
};

export function Tag({ children, variant = "default", size = "sm", className = "" }: TagProps) {
  const sizeClass = size === "md" ? "ds-tag ds-tag--md" : "ds-tag";
  return (
    <span className={`${sizeClass} ${variantClasses[variant]} ${className}`.trim()}>
      {children}
    </span>
  );
}
