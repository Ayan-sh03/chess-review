import { useEffect } from 'react';
import { useStore } from '../store';
import { Section } from '../ui/common';

export default function SavedGames() {
  const { savedGames, refreshSaved, openSaved, removeSaved } = useStore();
  useEffect(() => { refreshSaved(); }, [refreshSaved]);

  return (
    <Section title="Saved reviews">
      {savedGames.length === 0 ? (
        <p className="text-xs text-neutral-600">No saved reviews yet. Run a review and click “Save locally”.</p>
      ) : (
        <ul className="space-y-1.5">
          {savedGames.map((g) => (
            <li key={g.id} className="flex items-center gap-2 rounded bg-neutral-800/40 px-2 py-1.5">
              <button onClick={() => openSaved(g)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm text-neutral-200">
                  {g.tags.White ?? '?'} vs {g.tags.Black ?? '?'}
                </div>
                <div className="truncate text-[10px] text-neutral-500">
                  {g.openingName ?? 'Game'} · W {g.white.accuracy.toFixed(0)} / B {g.black.accuracy.toFixed(0)} ·{' '}
                  {new Date(g.createdAt).toLocaleString()}
                </div>
              </button>
              <button
                onClick={() => removeSaved(g.id)}
                className="rounded px-1.5 py-1 text-xs text-red-400 hover:bg-red-500/10"
                aria-label="Delete"
                title="Delete"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
