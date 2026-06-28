import type { Classification, Color, Score, Thresholds } from '../types';
import { winPctFor } from './winprob';

export interface ClassifyInput {
  scoreBefore: Score; // White POV — best play at the position before the move
  scoreAfter: Score; // White POV — eval after the played move
  moverColor: Color;
  playedUci: string;
  bestUci?: string;
  secondBestScore?: Score; // White POV — 2nd best move (multipv[1]) before move
  legalCount: number;
  isBook: boolean;
  sacrificedMaterial: number; // pawns sacrificed by the played move (>= 0)
  thresholds: Thresholds;
}

export interface ClassifyResult {
  classification: Classification;
  winPctBefore: number; // mover POV
  winPctAfter: number; // mover POV
  winPctLoss: number; // mover POV (>= 0)
  isForced: boolean;
}

/**
 * Win-probability-driven move classification. Bands operate on win% lost
 * (mover POV) rather than raw centipawns, with sacrifice / only-move
 * heuristics layered on top for Brilliant and Great.
 */
export function classify(inp: ClassifyInput): ClassifyResult {
  const { moverColor, thresholds: t } = inp;
  const winBefore = winPctFor(inp.scoreBefore, moverColor);
  const winAfter = winPctFor(inp.scoreAfter, moverColor);
  const winLoss = Math.max(0, winBefore - winAfter);
  const matchedBest =
    !!inp.bestUci && inp.playedUci === inp.bestUci;
  const isForced = inp.legalCount <= 1;

  const base: Omit<ClassifyResult, 'classification'> = {
    winPctBefore: winBefore,
    winPctAfter: winAfter,
    winPctLoss: winLoss,
    isForced,
  };

  if (inp.isBook) return { ...base, classification: 'book' };

  // Gap to the second-best move — large gap ⇒ this was a critical / only move.
  const secondWin =
    inp.secondBestScore != null
      ? winPctFor(inp.secondBestScore, moverColor)
      : undefined;
  const critical = secondWin != null && winBefore - secondWin >= t.greatMinSwing;

  // Brilliant: a sound sacrifice that keeps the advantage and is (near) best.
  const soundSac =
    inp.sacrificedMaterial >= t.brilliantMinSacrifice &&
    winAfter >= 50 && // still at least equal after the sac
    winLoss <= t.excellent && // didn't throw anything away
    !inp.isBook;
  if (soundSac && winAfter >= winBefore - t.best) {
    return { ...base, classification: 'brilliant' };
  }

  // Great: the clearly-best move in a critical / only-move position.
  if (critical && matchedBest && winLoss <= t.best) {
    return { ...base, classification: 'great' };
  }

  // Missed win: was winning, but the move surrendered it.
  if (winBefore >= t.missedWinThreshold && winAfter < t.missedWinThreshold) {
    // A forced single move can't be blamed.
    if (!isForced) return { ...base, classification: 'missed' };
  }

  if (isForced) return { ...base, classification: 'forced' };

  if (matchedBest || winLoss <= t.best) return { ...base, classification: 'best' };
  if (winLoss <= t.excellent) return { ...base, classification: 'excellent' };
  if (winLoss <= t.good) return { ...base, classification: 'good' };
  if (winLoss <= t.inaccuracy) return { ...base, classification: 'inaccuracy' };
  if (winLoss <= t.mistake) return { ...base, classification: 'mistake' };
  return { ...base, classification: 'blunder' };
}
