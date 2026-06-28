import { Chess } from 'chess.js';
import type { Color } from '../types';

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Sum of piece values for `color` from a FEN's board field. */
export function material(fen: string, color: Color): number {
  const board = fen.split(' ')[0];
  let sum = 0;
  for (const ch of board) {
    if (ch === '/' || (ch >= '1' && ch <= '8')) continue;
    const isWhite = ch === ch.toUpperCase();
    const piece = ch.toLowerCase();
    if ((color === 'w') === isWhite) sum += VALUE[piece] ?? 0;
  }
  return sum;
}

/**
 * Estimate material (in pawns) the mover voluntarily gave up: how far down
 * they are two plies later (after their move and the opponent's best reply),
 * relative to before. Positive ⇒ a sacrifice that the engine still rates well.
 * Conservative by design — used only as a Brilliant gate.
 */
export function netSacrifice(
  fenBefore: string,
  playedUci: string,
  replyUci: string | undefined,
  moverColor: Color
): number {
  const before = material(fenBefore, moverColor);
  try {
    const c = new Chess(fenBefore);
    c.move(uciToMoveObj(playedUci));
    if (replyUci) c.move(uciToMoveObj(replyUci));
    const after = material(c.fen(), moverColor);
    return Math.max(0, before - after);
  } catch {
    return 0;
  }
}

export function uciToMoveObj(uci: string): {
  from: string;
  to: string;
  promotion?: string;
} {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}
