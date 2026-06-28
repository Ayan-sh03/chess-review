import { useStore } from '../store';
import { Section } from '../ui/common';
import { DEFAULT_SETTINGS, type Thresholds } from '../types';

function Num({
  label, value, min, max, step = 1, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-neutral-400">
      <span>{label}</span>
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(+e.target.value)}
        className="w-20 rounded bg-neutral-950 px-2 py-1 text-right text-neutral-200 outline-none ring-1 ring-neutral-700"
      />
    </label>
  );
}

const THRESH_FIELDS: { key: keyof Thresholds; label: string; max: number }[] = [
  { key: 'best', label: 'Best (≤ win% loss)', max: 100 },
  { key: 'excellent', label: 'Excellent (≤)', max: 100 },
  { key: 'good', label: 'Good (≤)', max: 100 },
  { key: 'inaccuracy', label: 'Inaccuracy (≤)', max: 100 },
  { key: 'mistake', label: 'Mistake (≤, else Blunder)', max: 100 },
  { key: 'greatMinSwing', label: 'Great: min only-move swing', max: 100 },
  { key: 'brilliantMinSacrifice', label: 'Brilliant: min sacrifice (pawns)', max: 9 },
  { key: 'missedWinThreshold', label: 'Missed-win: winning at win%', max: 100 },
];

export default function SettingsPanel() {
  const { settings, updateSettings, threadsAvailable, resetReviewWithSettings } = useStore();
  const e = settings.engine;
  const t = settings.thresholds;

  return (
    <div className="space-y-3">
      <Section title="Engine">
        <div className="space-y-1.5">
          <Num label="Shallow depth (pass 1)" value={e.shallowDepth} min={6} max={20}
            onChange={(v) => updateSettings({ engine: { ...e, shallowDepth: v } })} />
          <Num label="Deep depth (pass 2)" value={e.deepDepth} min={10} max={30}
            onChange={(v) => updateSettings({ engine: { ...e, deepDepth: v } })} />
          <Num label="MultiPV lines" value={e.multiPv} min={1} max={5}
            onChange={(v) => updateSettings({ engine: { ...e, multiPv: v } })} />
          <Num label={`Threads ${threadsAvailable ? '' : '(single-thread build)'}`} value={e.threads} min={1} max={16}
            onChange={(v) => updateSettings({ engine: { ...e, threads: v } })} />
          <Num label="Hash (MB)" value={e.hashMb} min={16} max={512} step={16}
            onChange={(v) => updateSettings({ engine: { ...e, hashMb: v } })} />
        </div>
      </Section>

      <Section title="Classification thresholds" right={
        <button onClick={resetReviewWithSettings} className="text-[10px] text-emerald-400 hover:underline">
          re-classify
        </button>
      }>
        <div className="space-y-1.5">
          {THRESH_FIELDS.map((f) => (
            <Num key={f.key} label={f.label} value={t[f.key]} min={0} max={f.max}
              step={f.key === 'brilliantMinSacrifice' ? 0.5 : 1}
              onChange={(v) => updateSettings({ thresholds: { ...t, [f.key]: v } })} />
          ))}
          <button
            onClick={() => updateSettings({ thresholds: DEFAULT_SETTINGS.thresholds })}
            className="mt-1 text-[10px] text-neutral-500 hover:text-neutral-300"
          >
            Reset thresholds to defaults
          </button>
        </div>
      </Section>

      <Section title="Board & display">
        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs text-neutral-400">
            Light squares
            <input type="color" value={settings.boardLight}
              onChange={(e2) => updateSettings({ boardLight: e2.target.value })}
              className="h-6 w-10 rounded bg-transparent" />
          </label>
          <label className="flex items-center justify-between text-xs text-neutral-400">
            Dark squares
            <input type="color" value={settings.boardDark}
              onChange={(e2) => updateSettings({ boardDark: e2.target.value })}
              className="h-6 w-10 rounded bg-transparent" />
          </label>
          <Toggle label="Best-move arrows" checked={settings.showArrows}
            onChange={(v) => updateSettings({ showArrows: v })} />
          <Toggle label="Secondary MultiPV arrows" checked={settings.showMultiPvArrows}
            onChange={(v) => updateSettings({ showMultiPvArrows: v })} />
          <Toggle label="Auto-flip to side under review" checked={settings.autoFlip}
            onChange={(v) => updateSettings({ autoFlip: v })} />
        </div>
      </Section>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-xs text-neutral-400">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-emerald-500" />
    </label>
  );
}
