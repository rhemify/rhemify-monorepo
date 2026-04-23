interface StatValueProps {
  label: string;
  value: string | number;
  sub?: string;
  subColor?: string;
  mono?: boolean;
}

export function StatValue({ label, value, sub, subColor, mono }: StatValueProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground leading-none">{label}</span>
      <span
        className={`font-semibold tracking-[-0.03em] text-foreground leading-none ${
          mono ? "text-[28px] font-mono" : "text-[32px]"
        }`}
      >
        {value}
      </span>
      {sub && (
        <span
          className="text-xs leading-none"
          style={{ color: subColor || "var(--foreground, rgba(255,255,255,0.2))" }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
