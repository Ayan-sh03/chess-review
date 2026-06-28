import { useStore } from '../store';
import { formatScore, winPctWhite } from '../logic/winprob';
import type { Score } from '../types';

export default function EvalBar() {
  const { liveAnalysis, review, currentPly, orientation, variation } = useStore();

  const score: Score | undefined =
    liveAnalysis?.lines[0]?.score ??
    (!variation ? review?.moves[currentPly - 1]?.scoreAfter : undefined) ??
    { cp: 0 };

  const whitePct = score ? winPctWhite(score) : 50;
  // Bar fills from White's side. White is bottom when oriented white.
  const whiteHeight = `${whitePct}%`;
  const label = score ? formatScore(score) : '0.00';
  const whiteWinning = (score?.mate ?? score?.cp ?? 0) >= 0;

  return (
    <div
      className="relative flex h-full w-7 flex-col overflow-hidden rounded bg-neutral-900 ring-1 ring-neutral-800"
      title={`Win chance — White ${whitePct.toFixed(0)}%`}
      aria-label={`Evaluation ${label}`}
    >
      <div className={`flex w-full flex-col ${orientation === 'white' ? 'flex-col-reverse' : ''} h-full`}>
        <div
          className="w-full bg-neutral-100 transition-[height] duration-500 ease-out"
          style={{ height: whiteHeight }}
        />
        <div className="w-full flex-1 bg-neutral-800" />
      </div>
      <span
        className={`absolute inset-x-0 ${
          orientation === 'white'
            ? whiteWinning
              ? 'bottom-1 text-neutral-900'
              : 'top-1 text-neutral-100'
            : whiteWinning
              ? 'top-1 text-neutral-900'
              : 'bottom-1 text-neutral-100'
        } text-center text-[10px] font-bold tabular-nums`}
      >
        {label.replace(/^\+/, '')}
      </span>
    </div>
  );
}
