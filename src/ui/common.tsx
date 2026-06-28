import type { Classification } from '../types';
import { CLASSIFICATION_META } from '../types';

/** Small colored badge for a classification (move list, board overlay). */
export function ClassBadge({
  cls,
  size = 18,
  title,
}: {
  cls: Classification;
  size?: number;
  title?: boolean;
}) {
  const meta = CLASSIFICATION_META[cls];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold leading-none text-neutral-950 shrink-0"
      style={{ background: meta.color, width: size, height: size, fontSize: size * 0.5 }}
      title={title ? meta.label : undefined}
      aria-label={meta.label}
    >
      {meta.glyph}
    </span>
  );
}

export function Pill({
  children,
  color,
  className = '',
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${className}`}
      style={color ? { background: `${color}22`, color } : undefined}
    >
      {children}
    </span>
  );
}

export function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}
