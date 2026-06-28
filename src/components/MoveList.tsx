import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { ClassBadge } from '../ui/common';
import { formatScore } from '../logic/winprob';
import { CLASSIFICATION_META } from '../types';

export default function MoveList() {
  const { games, selectedGameIndex, review, currentPly, goTo } = useStore();
  const game = games[selectedGameIndex];
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentPly]);

  if (!game || game.plies.length === 0)
    return <p className="p-3 text-sm text-neutral-500">No moves to show.</p>;

  const rows: { num: number; w?: number; b?: number }[] = [];
  game.plies.forEach((p, i) => {
    if (p.color === 'w') rows.push({ num: p.moveNumber, w: i });
    else {
      const last = rows[rows.length - 1];
      if (last && last.b === undefined && last.num === p.moveNumber) last.b = i;
      else rows.push({ num: p.moveNumber, b: i });
    }
  });

  const Cell = ({ idx }: { idx?: number }) => {
    if (idx === undefined) return <span />;
    const ply = game.plies[idx];
    const r = review?.moves[idx];
    const isActive = currentPly === idx + 1;
    return (
      <button
        ref={isActive ? activeRef : undefined}
        onClick={() => goTo(idx + 1)}
        className={`group flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-sm
          ${isActive ? 'bg-emerald-700/40 ring-1 ring-emerald-600' : 'hover:bg-neutral-800'}`}
        title={r ? `${CLASSIFICATION_META[r.classification].label}${r.scoreAfter ? ' · ' + formatScore(r.scoreAfter) : ''}` : undefined}
      >
        {r && !r.isBook && <ClassBadge cls={r.classification} size={14} />}
        <span className="font-mono">{ply.san}</span>
        {r?.scoreAfter && (
          <span className="ml-auto text-[10px] tabular-nums text-neutral-500 group-hover:text-neutral-400">
            {formatScore(r.scoreAfter)}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="scroll-thin max-h-[60vh] overflow-y-auto p-1">
      {review?.openingName && (
        <div className="mb-1 px-2 py-1 text-xs text-amber-300/80">
          📖 {review.openingName} {review.eco ? `(${review.eco})` : ''}
        </div>
      )}
      <div className="grid grid-cols-[2rem_1fr_1fr] items-center gap-x-1 gap-y-0.5">
        {rows.map((r) => (
          <div key={r.num} className="contents">
            <span className="px-1 text-right text-xs tabular-nums text-neutral-500">
              {r.num}.
            </span>
            <Cell idx={r.w} />
            <Cell idx={r.b} />
          </div>
        ))}
      </div>
    </div>
  );
}
