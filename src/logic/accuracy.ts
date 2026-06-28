import type {
  Classification,
  Color,
  MoveReview,
  PhaseStats,
  PlayerStats,
} from '../types';
import { material } from './material';

const ALL_CLASSES: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'missed',
  'blunder',
  'forced',
];

/** Lichess-style per-move accuracy (0..100) from win% lost (mover POV). */
export function accuracyFromWinLoss(winPctLoss: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * winPctLoss) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

/** Heuristic accuracy from average centipawn loss. */
export function accuracyFromAcpl(acpl: number): number {
  return Math.max(0, Math.min(100, 100 * Math.exp(-acpl / 250)));
}

function emptyCounts(): Record<Classification, number> {
  return Object.fromEntries(ALL_CLASSES.map((c) => [c, 0])) as Record<
    Classification,
    number
  >;
}

type Phase = 'opening' | 'middlegame' | 'endgame';

/** Classify the game phase at a position from its material + move number. */
export function phaseOf(fen: string, moveNumber: number): Phase {
  const nonPawn = nonPawnMaterial(fen);
  if (nonPawn <= 14) return 'endgame';
  if (moveNumber <= 12) return 'opening';
  return 'middlegame';
}

function nonPawnMaterial(fen: string): number {
  const board = fen.split(' ')[0];
  const v: Record<string, number> = { n: 3, b: 3, r: 5, q: 9 };
  let sum = 0;
  for (const ch of board) {
    const p = ch.toLowerCase();
    if (v[p]) sum += v[p];
  }
  return sum;
}

function estimateRating(accuracy: number): number {
  return Math.round(Math.max(100, Math.min(2900, 2900 - (100 - accuracy) * 45)));
}

/** Aggregate per-player statistics from the per-move reviews. */
export function computeStats(moves: MoveReview[], color: Color): PlayerStats {
  const mine = moves.filter((m) => m.color === color);
  const counts = emptyCounts();
  for (const m of mine) counts[m.classification]++;

  // Exclude book/forced from accuracy & ACPL.
  const scored = mine.filter((m) => !m.isBook && !m.isForced);

  const acpl = mean(scored.map((m) => m.cpLoss));
  const accuracyWin = mean(scored.map((m) => accuracyFromWinLoss(m.winPctLoss)));
  const accuracyAcpl = accuracyFromAcpl(acpl);
  const accuracy = 0.6 * accuracyWin + 0.4 * accuracyAcpl;

  const phase = phaseAccuracy(scored);

  return {
    counts,
    acpl: round1(acpl),
    accuracyAcpl: round1(accuracyAcpl),
    accuracyWin: round1(accuracyWin),
    accuracy: round1(accuracy),
    phase,
    estRating: estimateRating(accuracy),
  };
}

function phaseAccuracy(scored: MoveReview[]): PhaseStats {
  const buckets: Record<Phase, number[]> = {
    opening: [],
    middlegame: [],
    endgame: [],
  };
  for (const m of scored) {
    const ph = phaseOf(m.fenBefore, m.moveNumber);
    buckets[ph].push(accuracyFromWinLoss(m.winPctLoss));
  }
  const acc = (xs: number[]) => (xs.length ? round1(mean(xs)) : -1);
  return {
    opening: acc(buckets.opening),
    middlegame: acc(buckets.middlegame),
    endgame: acc(buckets.endgame),
  };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// Re-export so consumers can compute material if needed.
export { material };
