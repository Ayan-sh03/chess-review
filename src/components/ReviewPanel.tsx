import { useStore } from '../store';
import { Section, ClassBadge, Pill } from '../ui/common';
import { CLASSIFICATION_META, type Classification, type PlayerStats } from '../types';
import { formatScore } from '../logic/winprob';
import {
  toPgnWithComments,
  toJsonReport,
  downloadText,
  downloadSummaryPng,
} from '../logic/export';

const COUNT_ORDER: Classification[] = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book',
  'inaccuracy', 'mistake', 'missed', 'blunder', 'forced',
];

export default function ReviewPanel() {
  const { review, status, progress, saveCurrent, currentPly, games, selectedGameIndex } = useStore();
  const game = games[selectedGameIndex];

  if (!review) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        {status === 'reviewing'
          ? `Analyzing… ${progress?.done ?? 0}/${progress?.total ?? '?'} (${progress?.pass} pass)`
          : 'Run a review to see accuracy, classifications and phase stats.'}
      </div>
    );
  }

  const white = review.white;
  const black = review.black;
  const cur = currentPly > 0 ? review.moves[currentPly - 1] : undefined;

  return (
    <div className="space-y-3">
      {status === 'reviewing' && progress && (
        <div className="rounded bg-neutral-800/60 px-3 py-1.5 text-xs text-emerald-300">
          Analyzing {progress.done}/{progress.total} · {progress.pass} pass…
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <PlayerCard name={review.tags.White ?? 'White'} elo={review.tags.WhiteElo} s={white} />
        <PlayerCard name={review.tags.Black ?? 'Black'} elo={review.tags.BlackElo} s={black} />
      </div>

      {cur && (
        <Section title={`Move ${cur.moveNumber}${cur.color === 'w' ? '.' : '...'} ${cur.playedMove}`}>
          <div className="flex items-center gap-2">
            <ClassBadge cls={cur.classification} size={22} />
            <span className="font-semibold" style={{ color: CLASSIFICATION_META[cur.classification].color }}>
              {CLASSIFICATION_META[cur.classification].label}
            </span>
            {cur.scoreAfter && (
              <Pill className="ml-auto" color="#737373">{formatScore(cur.scoreAfter)}</Pill>
            )}
          </div>
          <div className="mt-2 space-y-0.5 text-xs text-neutral-400">
            {cur.bestMove && cur.bestMove !== cur.playedMove && (
              <p>Best was <b className="font-mono text-emerald-300">{cur.bestMove}</b></p>
            )}
            {cur.cpLoss > 0 && <p>Centipawn loss: <b className="text-neutral-200">{cur.cpLoss}</b></p>}
            <p>Win% loss: <b className="text-neutral-200">{cur.winPctLoss.toFixed(1)}%</b> · depth {cur.depth}</p>
            {cur.comment && <p className="text-amber-300/80">{cur.comment}</p>}
          </div>
        </Section>
      )}

      <Section title="Export & save">
        <div className="flex flex-wrap gap-2">
          <ExportBtn onClick={() => saveCurrent()}>💾 Save locally</ExportBtn>
          <ExportBtn onClick={() => downloadText(`${fileBase(review)}.pgn`, toPgnWithComments(review), 'application/x-chess-pgn')}>
            ⬇ PGN + comments
          </ExportBtn>
          <ExportBtn onClick={() => downloadText(`${fileBase(review)}.json`, toJsonReport(review), 'application/json')}>
            ⬇ JSON
          </ExportBtn>
          <ExportBtn onClick={() => downloadSummaryPng(review)}>🖼 PNG summary</ExportBtn>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-neutral-600">
          Evals depend on engine depth/hardware. This report was generated at depth {review.finalDepth};
          pin the same depth for reproducible numbers. {game ? `${game.plies.length} plies analyzed.` : ''}
        </p>
      </Section>
    </div>
  );
}

function PlayerCard({ name, elo, s }: { name: string; elo?: string; s: PlayerStats }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="truncate text-sm font-semibold text-neutral-200" title={name}>{name}</h3>
        {elo && <span className="text-xs text-neutral-500">{elo}</span>}
      </div>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-3xl font-bold text-emerald-400 tabular-nums">{s.accuracy.toFixed(1)}</span>
        <span className="pb-1 text-xs text-neutral-500">accuracy</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-2 text-[10px] text-neutral-500">
        <span>Win-model: {s.accuracyWin.toFixed(1)}</span>
        <span>ACPL-model: {s.accuracyAcpl.toFixed(1)}</span>
        <span>ACPL: {s.acpl.toFixed(0)}</span>
        {s.estRating != null && <span>~{s.estRating} rating</span>}
      </div>

      <div className="mt-2 border-t border-neutral-800 pt-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-600">Phase accuracy</p>
        <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
          <Phase label="Open" v={s.phase.opening} />
          <Phase label="Middle" v={s.phase.middlegame} />
          <Phase label="End" v={s.phase.endgame} />
        </div>
      </div>

      <div className="mt-2 space-y-0.5">
        {COUNT_ORDER.filter((c) => s.counts[c] > 0).map((c) => (
          <div key={c} className="flex items-center gap-1.5 text-xs">
            <ClassBadge cls={c} size={13} />
            <span className="text-neutral-400">{CLASSIFICATION_META[c].label}</span>
            <span className="ml-auto tabular-nums text-neutral-300">{s.counts[c]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Phase({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded bg-neutral-800/60 py-1">
      <div className="font-semibold tabular-nums text-neutral-200">{v < 0 ? '—' : v.toFixed(0)}</div>
      <div className="text-[9px] text-neutral-500">{label}</div>
    </div>
  );
}

function ExportBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-700"
    >
      {children}
    </button>
  );
}

function fileBase(review: { tags: { White?: string; Black?: string } }): string {
  return `${review.tags.White ?? 'white'}-vs-${review.tags.Black ?? 'black'}`.replace(/[^\w-]+/g, '_');
}
