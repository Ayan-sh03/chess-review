import { Chess } from 'chess.js';
import type { GameTags } from '../types';
import { uciToMoveObj } from './material';

export interface ParsedPly {
  ply: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
}

export interface ParsedGame {
  tags: GameTags;
  pgn: string;
  startFen: string;
  plies: ParsedPly[];
}

export class PgnError extends Error {}

/**
 * Split a multi-game PGN blob into individual game strings. A new game begins
 * whenever a `[Tag]` line appears after we have already started reading
 * movetext for the current game.
 */
export function splitPgnGames(pgn: string): string[] {
  const lines = pgn.replace(/\r\n?/g, '\n').split('\n');
  const games: string[] = [];
  let cur: string[] = [];
  let inMoves = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('[') && inMoves) {
      games.push(cur.join('\n').trim());
      cur = [];
      inMoves = false;
    }
    if (t !== '' && !t.startsWith('[')) inMoves = true;
    cur.push(line);
  }
  if (cur.join('').trim()) games.push(cur.join('\n').trim());
  return games.filter((g) => g.length > 0);
}

/** Parse one game's PGN into per-ply records, with clear errors. */
export function parseGame(pgnText: string): ParsedGame {
  const chess = new Chess();
  try {
    chess.loadPgn(pgnText, { strict: false });
  } catch (e: any) {
    throw new PgnError(`Could not parse PGN: ${e?.message ?? e}`);
  }
  const tags = chess.getHeaders() as GameTags;
  const startFen =
    tags.FEN && tags.SetUp === '1'
      ? tags.FEN
      : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const verbose = chess.history({ verbose: true });
  if (verbose.length === 0) {
    // Could be a tags-only or FEN-only "game"; allow it (single position).
  }
  const plies: ParsedPly[] = verbose.map((m: any, i: number) => ({
    ply: i + 1,
    moveNumber: Math.floor(i / 2) + 1,
    color: m.color,
    san: m.san,
    uci: m.lan,
    fenBefore: m.before,
    fenAfter: m.after,
  }));

  return { tags, pgn: pgnText, startFen, plies };
}

export function parseMultiGame(pgn: string): ParsedGame[] {
  const chunks = splitPgnGames(pgn);
  if (chunks.length === 0) throw new PgnError('No games found in the PGN.');
  const out: ParsedGame[] = [];
  const errors: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      out.push(parseGame(chunks[i]));
    } catch (e: any) {
      errors.push(`Game ${i + 1}: ${e?.message ?? e}`);
    }
  }
  if (out.length === 0) throw new PgnError(errors.join('\n') || 'No valid games.');
  return out;
}

/** Validate a FEN and return a single-position "game". */
export function gameFromFen(fen: string): ParsedGame {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch (e: any) {
    throw new PgnError(`Invalid FEN: ${e?.message ?? e}`);
  }
  return {
    tags: { FEN: chess.fen(), SetUp: '1' } as GameTags,
    pgn: '',
    startFen: chess.fen(),
    plies: [],
  };
}

/** Convert a UCI line into SAN, played from `fen`. Stops at the first illegal. */
export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciMoves) {
    try {
      const mv = chess.move(uciToMoveObj(uci));
      if (!mv) break;
      out.push(mv.san);
    } catch {
      break;
    }
  }
  return out;
}

export function uciToSan(fen: string, uci: string): string | undefined {
  return uciLineToSan(fen, [uci])[0];
}

/** Number of legal moves in a position (for "forced" detection). */
export function legalMoveCount(fen: string): number {
  try {
    return new Chess(fen).moves().length;
  } catch {
    return 99;
  }
}
