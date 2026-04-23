interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (v: number) => string;
}

const defaultFormat = (v: number) => `$${v.toFixed(2)}`;

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue = defaultFormat,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <style>{`
        .rhemify-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          border-radius: 9999px;
          outline: none;
          cursor: pointer;
        }
        .rhemify-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid var(--primary);
          cursor: pointer;
        }
        .rhemify-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid var(--primary);
          cursor: pointer;
        }
        .rhemify-slider::-moz-range-track {
          height: 4px;
          border-radius: 9999px;
        }
      `}</style>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        <span className="text-[13px] font-mono text-muted-foreground">{formatValue(value)}</span>
      </div>
      <input
        className="rhemify-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${pct}%, var(--border) ${pct}%, var(--border) 100%)`,
        }}
      />
    </div>
  );
}
