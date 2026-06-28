import { useStore } from '../store';

/** Shown when exploring an engine line in the sandbox. */
export default function VariationBar() {
  const { variation, popVariation, exitVariation } = useStore();
  if (!variation) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-sky-800 bg-sky-950/40 px-3 py-2 text-xs">
      <span className="font-semibold text-sky-300">Variation</span>
      <div className="scroll-thin flex-1 overflow-x-auto whitespace-nowrap font-mono text-neutral-300">
        {variation.history.length === 0 ? (
          <span className="text-neutral-500">drag a piece or click an engine line…</span>
        ) : (
          variation.history.map((h, i) => (
            <span key={i} className="mr-1">
              {i % 2 === 0 && <span className="text-neutral-600">{Math.floor(i / 2) + 1}.</span>} {h.san}
            </span>
          ))
        )}
      </div>
      <button onClick={popVariation} className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700">
        ↶ Back
      </button>
      <button onClick={exitVariation} className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 hover:bg-neutral-700">
        ✕ Exit
      </button>
    </div>
  );
}
