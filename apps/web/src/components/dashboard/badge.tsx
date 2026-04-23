import { type ReactNode, type CSSProperties } from "react";

type BadgeVariant = "success" | "danger" | "warning" | "info" | "neutral";

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
}

const variantStyles: Record<BadgeVariant, CSSProperties> = {
  success: { background: "rgba(22, 163, 74, 0.12)", color: "var(--color-rhm-success)" },
  danger: { background: "rgba(239, 68, 68, 0.12)", color: "var(--color-rhm-danger)" },
  warning: { background: "rgba(245, 158, 11, 0.12)", color: "var(--color-rhm-warning)" },
  info: { background: "rgba(71, 200, 255, 0.12)", color: "#47c8ff" },
  neutral: { background: "var(--card)", color: "var(--muted-foreground)" },
};

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className="h-5 text-[10px] font-mono px-[7px] rounded inline-flex items-center font-medium leading-none"
      style={variantStyles[variant]}
    >
      {children}
    </span>
  );
}
