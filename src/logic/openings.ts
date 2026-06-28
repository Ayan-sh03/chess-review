import raw from '../data/openings.json';

interface OpeningEntry {
  eco: string;
  name: string;
  san: string;
}

const BOOK: { eco: string; name: string; moves: string[] }[] = (
  raw as OpeningEntry[]
).map((e) => ({ eco: e.eco, name: e.name, moves: e.san.split(/\s+/) }));

export interface OpeningMatch {
  eco: string;
  name: string;
  bookPlies: number; // how many plies of the game are still "in book"
}

/**
 * Match the longest opening line that is a prefix of the played SAN moves.
 * Returns the ECO/name plus how many opening moves were followed (used to
 * flag those plies as "book").
 */
export function findOpening(sanMoves: string[]): OpeningMatch | undefined {
  let best: OpeningMatch | undefined;
  for (const entry of BOOK) {
    const n = entry.moves.length;
    if (n > sanMoves.length) continue;
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (entry.moves[i] !== sanMoves[i]) {
        ok = false;
        break;
      }
    }
    if (ok && (!best || n > best.bookPlies)) {
      best = { eco: entry.eco, name: entry.name, bookPlies: n };
    }
  }
  return best;
}
