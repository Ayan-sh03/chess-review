import type { Score, Color } from '../types';

// Centipawn value we treat a forced mate as, so it dominates any cp score but
// still produces a finite number for arithmetic / graphing.
const MATE_CP = 100000;

/** Collapse a (cp | mate) score into a single White-POV centipawn number. */
export function scoreToCp(score: Score): number {
  if (score.mate != null) {
    // Nearer mates are "bigger". Sign carries which side mates.
    const sign = score.mate > 0 ? 1 : -1;
    return sign * (MATE_CP - Math.min(Math.abs(score.mate), 1000) * 10);
  }
  return score.cp ?? 0;
}

/** White-POV eval in pawns, clamped to ±`clamp` for bars/graphs. */
export function scoreToEvalPawns(score: Score, clamp = 12): number {
  if (score.mate != null) return score.mate > 0 ? clamp : -clamp;
  const p = (score.cp ?? 0) / 100;
  return Math.max(-clamp, Math.min(clamp, p));
}

/**
 * Win probability (0..100) for White, from a White-POV centipawn score.
 * Logistic model matching Lichess' accuracy curve.
 */
export function winPctFromCp(cp: number): number {
  const c = Math.max(-MATE_CP, Math.min(MATE_CP, cp));
  const w = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
  return Math.max(0, Math.min(100, w));
}

export function winPctWhite(score: Score): number {
  return winPctFromCp(scoreToCp(score));
}

/** Win probability for a given side (mover POV helper). */
export function winPctFor(score: Score, color: Color): number {
  const w = winPctWhite(score);
  return color === 'w' ? w : 100 - w;
}

/** Rough W/D/L split (%) for White from a White-POV cp score. */
export function wdl(cp: number): { win: number; draw: number; loss: number } {
  const win = winPctFromCp(cp);
  const loss = winPctFromCp(-cp);
  // The "win%" above already folds half the draw mass in; recover a draw band
  // that shrinks as the position becomes decisive.
  const decisive = Math.abs(win - loss); // 0 (equal) .. ~100 (won)
  const draw = Math.max(0, 100 - decisive) * 0.5;
  const scale = (100 - draw) / 100;
  return { win: win * scale, draw, loss: loss * scale };
}

/** Format a White-POV score the conventional way: +1.2 / -0.5 / M3 / -M2. */
export function formatScore(score: Score): string {
  if (score.mate != null) {
    if (score.mate === 0) return '#';
    return `${score.mate > 0 ? '' : '-'}M${Math.abs(score.mate)}`;
  }
  const p = (score.cp ?? 0) / 100;
  return `${p >= 0 ? '+' : ''}${p.toFixed(2)}`;
}
