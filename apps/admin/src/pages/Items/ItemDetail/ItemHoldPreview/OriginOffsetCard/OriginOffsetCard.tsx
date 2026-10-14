import React from 'react';
import './OriginOffsetCard.css';

type Theme = 'amber' | 'sky';

// Tailwind needs whole class names, so each theme spells them out
const THEMES: Record<Theme, { card: string; border: string; title: string; text: string; sub: string; btn: string; range: string; box: string }> = {
  amber: {
    card: 'bg-amber-50/70 border-amber-200',
    border: 'border-amber-200',
    title: 'text-amber-950',
    text: 'text-amber-900',
    sub: 'text-amber-700',
    btn: 'border-amber-300 hover:bg-amber-100 text-amber-900',
    range: 'bg-amber-200',
    box: 'border-amber-300',
  },
  sky: {
    card: 'bg-sky-50/70 border-sky-200',
    border: 'border-sky-200',
    title: 'text-sky-950',
    text: 'text-sky-900',
    sub: 'text-sky-700',
    btn: 'border-sky-300 hover:bg-sky-100 text-sky-900',
    range: 'bg-sky-200',
    box: 'border-sky-300',
  },
};

export interface OriginOffsetCardProps {
  testId: string;
  /** Prefix for the field labels and ids, e.g. "Particle" or "Light". */
  name: string;
  title: string;
  description: string;
  theme: Theme;
  x: number;
  y: number;
  onChange: (offset: { x?: number; y?: number }) => void;
  onReset: () => void;
}

/** X/Y origin controls (number box, slider, +/-, reset) for a held effect's position on the sprite. */
export const OriginOffsetCard: React.FC<OriginOffsetCardProps> = ({
  testId,
  name,
  title,
  description,
  theme,
  x,
  y,
  onChange,
  onReset,
}) => {
  const t = THEMES[theme];
  const axes = [
    { key: 'x' as const, id: `${name.toLowerCase()}-offset-x`, label: `${name} Horizontal Offset (X)`, value: x },
    { key: 'y' as const, id: `${name.toLowerCase()}-offset-y`, label: `${name} Vertical Offset (Y)`, value: y },
  ];

  return (
    <div className={`origin-offset-card border rounded-xl p-5 space-y-5 ${t.card}`} data-testid={testId}>
      <div className={`flex items-center justify-between border-b pb-3 ${t.border}`}>
        <div>
          <h4 className={`text-xs font-black uppercase tracking-wider ${t.title}`}>{title}</h4>
          <p className={`text-[11px] font-medium mt-0.5 ${t.sub}`}>{description}</p>
        </div>
        {(x !== 0 || y !== 0) && (
          <button
            type="button"
            onClick={onReset}
            className={`cursor-pointer text-[10px] font-bold bg-white border px-2 py-1 rounded transition ${t.btn}`}
          >
            Reset Origin
          </button>
        )}
      </div>

      {axes.map(({ key, id, label, value }) => (
        <div key={id} className="space-y-2">
          <div className={`flex justify-between items-center text-xs font-bold ${t.text}`}>
            <label htmlFor={id} className="cursor-pointer text-[11px] font-bold">
              {label}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Decrease ${label}`}
                onClick={() => onChange({ [key]: value - 1 })}
                className={`cursor-pointer w-6 h-6 rounded bg-white border font-bold flex items-center justify-center transition ${t.btn}`}
              >
                -
              </button>
              <input
                id={id}
                type="number"
                value={value}
                onChange={(e) => onChange({ [key]: Number(e.target.value) })}
                className={`w-16 p-1 text-center font-mono text-xs bg-white border rounded font-bold ${t.box}`}
              />
              <button
                type="button"
                aria-label={`Increase ${label}`}
                onClick={() => onChange({ [key]: value + 1 })}
                className={`cursor-pointer w-6 h-6 rounded bg-white border font-bold flex items-center justify-center transition ${t.btn}`}
              >
                +
              </button>
              <span className="text-[10px] font-medium opacity-70">px</span>
            </div>
          </div>
          <input
            type="range"
            aria-label={`${label} slider`}
            min="-600"
            max="600"
            step="1"
            value={value}
            onChange={(e) => onChange({ [key]: Number(e.target.value) })}
            className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${t.range}`}
          />
        </div>
      ))}
    </div>
  );
};

export default OriginOffsetCard;
