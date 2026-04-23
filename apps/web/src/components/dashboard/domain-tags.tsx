import { useState } from "react";

interface DomainTagsProps {
  domains: string[];
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
}

export function DomainTags({ domains, onAdd, onRemove }: DomainTagsProps) {
  const [adding, setAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      onAdd(inputValue.trim());
      setInputValue("");
      setAdding(false);
    }
    if (e.key === "Escape") {
      setInputValue("");
      setAdding(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex-1">
      <div className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-foreground/20 mb-5">
        DOMAIN ALLOWLIST
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {domains.map((d) => (
          <span
            key={d}
            className="inline-flex items-center gap-1.5 bg-white/[0.04] border border-border rounded px-2.5 py-1 font-mono text-[11px] text-foreground"
          >
            {d}
            <button
              type="button"
              onClick={() => onRemove(d)}
              aria-label={`Remove ${d}`}
              className="bg-transparent border-none text-foreground/20 cursor-pointer p-0 text-[13px] leading-none font-mono"
            >
              &times;
            </button>
          </span>
        ))}
        {adding ? (
          <input
            className="bg-transparent border border-rhm-accent rounded px-2.5 py-1 font-mono text-[11px] text-foreground outline-none w-[140px]"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (!inputValue.trim()) setAdding(false);
            }}
            placeholder="domain.com"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center border border-rhm-accent text-rhm-accent bg-transparent rounded px-2.5 py-1 font-mono text-[11px] cursor-pointer"
          >
            + add
          </button>
        )}
      </div>
    </div>
  );
}
