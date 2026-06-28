import { describe, it, expect } from 'vitest';
import {
  parseGame,
  parseMultiGame,
  splitPgnGames,
  uciLineToSan,
  uciToSan,
  legalMoveCount,
} from './pgn';
import { findOpening } from './openings';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const ONE = `[Event "A"]
[White "X"]
[Black "Y"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

const TWO = `${ONE}

[Event "B"]
[White "P"]
[Black "Q"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1`;

describe('pgn parsing', () => {
  it('parses a single game into plies', () => {
    const g = parseGame(ONE);
    expect(g.plies.length).toBe(6);
    expect(g.plies[0].san).toBe('e4');
    expect(g.plies[0].uci).toBe('e2e4');
    expect(g.tags.White).toBe('X');
  });

  it('splits and parses multiple games', () => {
    expect(splitPgnGames(TWO).length).toBe(2);
    const games = parseMultiGame(TWO);
    expect(games.length).toBe(2);
    expect(games[1].plies[0].san).toBe('d4');
  });

  it('converts UCI to SAN', () => {
    expect(uciToSan(START, 'e2e4')).toBe('e4');
    expect(uciLineToSan(START, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('counts legal moves for forced detection', () => {
    expect(legalMoveCount(START)).toBe(20);
  });
});

describe('openings', () => {
  it('matches the Ruy Lopez by longest prefix', () => {
    const m = findOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(m?.name).toContain('Ruy Lopez');
    expect(m?.bookPlies).toBeGreaterThanOrEqual(5);
  });
});
