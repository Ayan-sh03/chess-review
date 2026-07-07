import { useState } from 'react';
import { useStore } from '../store';
import { Section, Pill } from '../ui/common';
import type { CoachMoment } from '../types';
import {
  COACH_CLASS_META,
  TAG_LABEL,
  whyFlagged,
} from '../logic/coach';

export default function CoachPanel() {
  const { coachReport, review, status, progress } = useStore();

  if (!coachReport) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        {status === 'reviewing'
          ? `Analyzing… ${progress?.done ?? 0}/${progress?.total ?? '?'} (${progress?.pass} pass). Coach moments appear when the review finishes.`
          : review
            ? 'Preparing coach report…'
            : 'Run a game review first — the coach reads the finished analysis and picks out the key moments.'}
      </div>
    );
  }

  const { moments, summary, recurringTags } = coachReport;

  return (
    <div className="space-y-3">
      <Section title="🎓 Coach summary">
        <p className="text-sm leading-5 text-neutral-300">{summary}</p>
        {recurringTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recurringTags.map((t) => (
              <Pill key={t} color="#22a7f0">↻ {TAG_LABEL[t]}</Pill>
            ))}
          </div>
        )}
      </Section>

      {moments.map((m) => (
        <MomentCard key={m.ply} m={m} />
      ))}
    </div>
  );
}

function MomentCard({ m }: { m: CoachMoment }) {
  const { goTo, enterVariation, currentPly } = useStore();
  const [showWhy, setShowWhy] = useState(false);
  const meta = COACH_CLASS_META[m.classification];
  const side = m.sideToMove === 'w' ? 'White' : 'Black';
  const active = currentPly === m.ply;

  // Board helpers: jump to the position BEFORE the move, then play the
  // engine's move(s) as a variation so they are visible on the board.
  const showBestMove = () => {
    goTo(m.ply - 1);
    enterVariation([m.bestUci]);
  };
  const showEngineLine = () => {
    goTo(m.ply - 1);
    enterVariation(m.pvUci);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => goTo(m.ply)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') goTo(m.ply);
      }}
      className={`w-full cursor-pointer rounded-lg border bg-neutral-900/60 p-3 text-left transition hover:border-neutral-600 ${
        active ? 'border-emerald-600' : 'border-neutral-800'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          {meta.label}
        </span>
        <span className="text-sm font-semibold text-neutral-200">
          Move {m.moveNumber}{m.sideToMove === 'w' ? '.' : '…'} {m.playedMove}
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-neutral-500">
          −{Math.round(m.winProbDrop * 100)}% win chance · {side}
        </span>
      </div>

      <div className="mt-1.5 text-xs text-neutral-400">
        Played <b className="font-mono text-amber-300">{m.playedMove}</b> · best was{' '}
        <b className="font-mono text-emerald-300">{m.bestMove}</b>
      </div>

      {m.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {m.tags.map((t) => (
            <Pill key={t} color="#22a7f0">{TAG_LABEL[t]}</Pill>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs leading-5 text-neutral-300">{m.message}</p>
      <p className="mt-1 text-xs leading-5 text-neutral-500">💡 {m.advice}</p>

      {showWhy && (
        <p className="mt-2 rounded bg-neutral-800/60 px-2 py-1.5 text-[11px] leading-4 text-neutral-400">
          {whyFlagged(m)}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        <CardBtn onClick={() => setShowWhy((v) => !v)}>
          {showWhy ? 'Hide why' : 'Why was this flagged?'}
        </CardBtn>
        <CardBtn onClick={showBestMove}>Show best move</CardBtn>
        {m.pvUci.length > 1 && (
          <CardBtn onClick={showEngineLine} title={m.pvSan.join(' ')}>
            Show engine line
          </CardBtn>
        )}
      </div>
    </div>
  );
}

function CardBtn({
  onClick,
  children,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded bg-neutral-800 px-2 py-1 text-[11px] font-medium text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-700"
    >
      {children}
    </button>
  );
}
