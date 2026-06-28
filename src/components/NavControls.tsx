import { useStore } from '../store';

function Btn({
  onClick, label, children, active,
}: {
  onClick: () => void; label: string; children: React.ReactNode; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 min-w-9 items-center justify-center rounded px-2 text-sm font-medium ring-1 transition
        ${active
          ? 'bg-emerald-600 text-white ring-emerald-500'
          : 'bg-neutral-800 text-neutral-200 ring-neutral-700 hover:bg-neutral-700'}`}
    >
      {children}
    </button>
  );
}

export default function NavControls() {
  const {
    toStart, prev, next, toEnd, flip, autoplay, setAutoplay,
    currentPly, games, selectedGameIndex, settings, updateSettings,
  } = useStore();
  const game = games[selectedGameIndex];
  const total = game?.plies.length ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Btn onClick={toStart} label="Start">⏮</Btn>
      <Btn onClick={prev} label="Previous">◀</Btn>
      <span className="min-w-16 text-center text-xs tabular-nums text-neutral-400">
        {currentPly}/{total}
      </span>
      <Btn onClick={next} label="Next">▶</Btn>
      <Btn onClick={toEnd} label="End">⏭</Btn>
      <Btn onClick={() => setAutoplay(!autoplay)} label="Autoplay" active={autoplay}>
        {autoplay ? '⏸' : '⏯'}
      </Btn>
      <Btn onClick={flip} label="Flip board">⟲</Btn>
      <label className="ml-1 flex items-center gap-1 text-xs text-neutral-400">
        Speed
        <input
          type="range" min={200} max={2000} step={100}
          value={settings.autoplayMs}
          onChange={(e) => updateSettings({ autoplayMs: +e.target.value })}
          className="h-1 w-20 accent-emerald-500"
          aria-label="Autoplay speed"
        />
      </label>
    </div>
  );
}
