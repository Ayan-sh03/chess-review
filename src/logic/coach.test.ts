import { describe, expect, it } from 'vitest';
import type { MoveReview, Score } from '../types';
import {
  COACH_CONFIG,
  COACH_SCHEMA_VERSION,
  COACH_THRESHOLDS,
  buildCoachReport,
  classifyCoach,
  detectTags,
  toCoachMoment,
  whyFlagged,
} from './coach';
import { winPctFor } from './winprob';

// --------------------------- fixtures --------------------------------------
// Synthetic but realistic MoveReview records (fixed "engine output") so tests
// are reproducible without running Stockfish.

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// After 1.e4 e5 2.Nf3 (some legal position for PV walking).
const ITALIAN_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

let plyCounter = 0;

function mv(over: Partial<MoveReview> & { winPctBefore: number; winPctAfter: number }): MoveReview {
  plyCounter += 1;
  const ply = over.ply ?? plyCounter;
  const color = over.color ?? (ply % 2 === 1 ? 'w' : 'b');
  return {
    ply,
    moveNumber: Math.ceil(ply / 2),
    color,
    fenBefore: START_FEN,
    fenAfter: START_FEN,
    playedMove: 'a3',
    playedUci: 'a2a3',
    bestMove: 'd4',
    bestUci: 'd2d4',
    multipv: [],
    evalBefore: 0,
    evalAfter: 0,
    scoreBefore: { cp: 0 },
    scoreAfter: { cp: 0 },
    cpLoss: 0,
    winPctLoss: Math.max(0, over.winPctBefore - over.winPctAfter),
    classification: 'good',
    isBook: false,
    isForced: false,
    depth: 18,
    ...over,
  };
}

const okayMove = () => mv({ winPctBefore: 55, winPctAfter: 52 }); // 3-pt drop

// --------------------------- win prob & mate clamping ----------------------

describe('win probability (existing pipeline feeding the coach)', () => {
  it('clamps mate scores to near-certain win/loss instead of the logistic', () => {
    const mateFor: Score = { mate: 3 };
    const mateAgainst: Score = { mate: -2 };
    expect(winPctFor(mateFor, 'w')).toBeGreaterThan(99.9);
    expect(winPctFor(mateAgainst, 'w')).toBeLessThan(0.1);
    // POV flip: same scores judged from Black's side.
    expect(winPctFor(mateFor, 'b')).toBeLessThan(0.1);
    expect(winPctFor(mateAgainst, 'b')).toBeGreaterThan(99.9);
  });
});

// --------------------------- classification --------------------------------

describe('classifyCoach', () => {
  it('maps win-prob drops to bands at the configured thresholds', () => {
    expect(classifyCoach(0)).toBe('okay');
    expect(classifyCoach(0.099)).toBe('okay');
    expect(classifyCoach(COACH_THRESHOLDS.inaccuracy)).toBe('inaccuracy');
    expect(classifyCoach(0.19)).toBe('inaccuracy');
    expect(classifyCoach(COACH_THRESHOLDS.mistake)).toBe('mistake');
    expect(classifyCoach(0.29)).toBe('mistake');
    expect(classifyCoach(COACH_THRESHOLDS.blunder)).toBe('blunder');
    expect(classifyCoach(1)).toBe('blunder');
  });

  it('is based on win-prob delta, not raw centipawn drop: +800 -> +500 (still winning) is NOT a blunder', () => {
    // +800cp -> +500cp for White: both near-certain wins.
    const before = winPctFor({ cp: 800 }, 'w') / 100;
    const after = winPctFor({ cp: 500 }, 'w') / 100;
    expect(classifyCoach(Math.max(0, before - after))).toBe('okay');
    // +30cp -> -150cp: a real swing around equality.
    const b2 = winPctFor({ cp: 30 }, 'w') / 100;
    const a2 = winPctFor({ cp: -150 }, 'w') / 100;
    expect(classifyCoach(Math.max(0, b2 - a2))).not.toBe('okay');
  });

  it('is POV-correct: a Black move is judged from Black perspective', () => {
    // White-POV eval goes from -200 (good for Black) to +200 after Black's move.
    const before = winPctFor({ cp: -200 }, 'b');
    const after = winPctFor({ cp: 200 }, 'b');
    const m = mv({ color: 'b', ply: 2, winPctBefore: before, winPctAfter: after });
    const moment = toCoachMoment(m)!;
    expect(moment.classification).toBe('blunder');
    expect(moment.winProbDrop).toBeGreaterThan(0.3);
  });
});

// --------------------------- toCoachMoment ---------------------------------

describe('toCoachMoment', () => {
  it('every analyzed move gets exactly one classification', () => {
    const moment = toCoachMoment(okayMove())!;
    expect(['okay', 'inaccuracy', 'mistake', 'blunder']).toContain(moment.classification);
  });

  it('returns null for forced or unanalyzed moves', () => {
    expect(toCoachMoment(mv({ winPctBefore: 80, winPctAfter: 20, isForced: true }))).toBeNull();
    expect(toCoachMoment(mv({ winPctBefore: 80, winPctAfter: 20, bestMove: undefined, bestUci: undefined }))).toBeNull();
    expect(toCoachMoment(mv({ winPctBefore: 80, winPctAfter: 20, depth: 0 }))).toBeNull();
  });

  it('fills title, message and advice with concrete engine facts', () => {
    const m = mv({
      winPctBefore: 62,
      winPctAfter: 20,
      playedMove: 'Qh5',
      playedUci: 'd1h5',
      bestMove: 'Nf3',
      bestUci: 'g1f3',
    });
    const moment = toCoachMoment(m)!;
    expect(moment.classification).toBe('blunder');
    expect(moment.title).toBe('Big swing');
    expect(moment.message).toContain('62%');
    expect(moment.message).toContain('20%');
    expect(moment.message).toContain('Nf3');
    expect(moment.advice.length).toBeGreaterThan(0);
  });

  it('templates never assert a chess rationale the engine did not provide', () => {
    const moment = toCoachMoment(mv({ winPctBefore: 62, winPctAfter: 20 }))!;
    const text = `${moment.message} ${moment.advice}`.toLowerCase();
    // Words that would claim positional "why" knowledge we don't have:
    for (const banned of ['because it attacks', 'wins the', 'hangs your', 'weakens']) {
      expect(text).not.toContain(banned);
    }
  });

  it('builds a SAN PV from analysis lines when available', () => {
    const m = mv({
      winPctBefore: 60,
      winPctAfter: 30,
      fenBefore: ITALIAN_FEN,
      color: 'b',
      bestMove: 'Nc6',
      bestUci: 'b8c6',
    });
    const analysis = {
      fen: ITALIAN_FEN,
      depth: 18,
      lines: [{ multipv: 1, score: { cp: 20 }, uci: ['b8c6', 'f1c4', 'g8f6'] }],
      complete: true,
    };
    const moment = toCoachMoment(m, analysis)!;
    expect(moment.pvUci).toEqual(['b8c6', 'f1c4', 'g8f6']);
    expect(moment.pvSan).toEqual(['Nc6', 'Bc4', 'Nf6']);
  });
});

// --------------------------- tag detectors ---------------------------------

describe('tag detectors', () => {
  it('never fire on okay moves', () => {
    const m = mv({ winPctBefore: 90, winPctAfter: 89, playedMove: 'Qh5', bestMove: 'Rxe8#' });
    expect(detectTags(m, 'okay')).toEqual([]);
  });

  it('missed-check: best move checks, played move does not', () => {
    const m = mv({ winPctBefore: 70, winPctAfter: 40, playedMove: 'a3', bestMove: 'Qb5+' });
    expect(detectTags(m, 'mistake')).toContain('missed-check');
    // Played move also checks -> no tag.
    const m2 = mv({ winPctBefore: 70, winPctAfter: 40, playedMove: 'Ra8+', bestMove: 'Qb5+' });
    expect(detectTags(m2, 'mistake')).not.toContain('missed-check');
  });

  it('missed-capture: best move captures, played move does not', () => {
    const m = mv({ winPctBefore: 70, winPctAfter: 40, playedMove: 'Nf3', bestMove: 'Bxf7' });
    expect(detectTags(m, 'mistake')).toContain('missed-capture');
    const m2 = mv({ winPctBefore: 70, winPctAfter: 40, playedMove: 'Nxe5', bestMove: 'Bxf7' });
    expect(detectTags(m2, 'mistake')).not.toContain('missed-capture');
  });

  it('missed-mate: mate was available for the mover and is gone after the move', () => {
    const m = mv({
      winPctBefore: 100,
      winPctAfter: 60,
      color: 'w',
      scoreBefore: { mate: 2 },
      scoreAfter: { cp: 150 },
      playedMove: 'Rd1',
      bestMove: 'Qg7#',
    });
    expect(detectTags(m, 'blunder')).toContain('missed-mate');
    // Still mating after the move -> not "missed".
    const m2 = mv({
      winPctBefore: 100,
      winPctAfter: 100,
      color: 'w',
      scoreBefore: { mate: 2 },
      scoreAfter: { mate: 3 },
      playedMove: 'Rd1',
      bestMove: 'Qg7#',
    });
    expect(detectTags(m2, 'inaccuracy')).not.toContain('missed-mate');
    // Mate for the OPPONENT before the move must not count (POV check).
    const m3 = mv({
      winPctBefore: 40,
      winPctAfter: 10,
      color: 'w',
      scoreBefore: { mate: -3 },
      scoreAfter: { mate: -2 },
      playedMove: 'Rd1',
      bestMove: 'Qg7+',
    });
    expect(detectTags(m3, 'blunder')).not.toContain('missed-mate');
  });

  it('early-queen: queen move within the first 10 moves, only when worse than okay', () => {
    const early = mv({ winPctBefore: 55, winPctAfter: 40, ply: 5, playedMove: 'Qh5', bestMove: 'Nf3' });
    early.moveNumber = 3;
    expect(detectTags(early, 'inaccuracy')).toContain('early-queen');
    const late = mv({ winPctBefore: 55, winPctAfter: 40, playedMove: 'Qh5', bestMove: 'Nf3' });
    late.moveNumber = 25;
    expect(detectTags(late, 'inaccuracy')).not.toContain('early-queen');
    // Castling starts with 'O', not 'Q'.
    const castle = mv({ winPctBefore: 55, winPctAfter: 40, playedMove: 'O-O', bestMove: 'Nf3' });
    castle.moveNumber = 5;
    expect(detectTags(castle, 'inaccuracy')).not.toContain('early-queen');
  });

  it('a moment can carry multiple tags', () => {
    const m = mv({ winPctBefore: 80, winPctAfter: 30, playedMove: 'Qa4', bestMove: 'Qxf7+' });
    m.moveNumber = 6;
    const tags = detectTags(m, 'blunder');
    expect(tags).toContain('missed-check');
    expect(tags).toContain('missed-capture');
    expect(tags).toContain('early-queen');
  });
});

// --------------------------- report assembly -------------------------------

describe('buildCoachReport', () => {
  it('fixture: clean game -> empty moments, valid summary, no biggestMistake', () => {
    const moves = Array.from({ length: 20 }, () => okayMove());
    const r = buildCoachReport('clean', moves);
    expect(r.moments).toEqual([]);
    expect(r.biggestMistake).toBeUndefined();
    expect(r.recurringTags).toEqual([]);
    expect(r.summary.toLowerCase()).toContain('clean game');
    expect(r.coachSchemaVersion).toBe(COACH_SCHEMA_VERSION);
  });

  it('fixture: single decisive blunder -> one moment, correct biggestMistake and summary', () => {
    const moves = [
      okayMove(),
      okayMove(),
      mv({ winPctBefore: 58, winPctAfter: 8, playedMove: 'Rd1', bestMove: 'Nf3', ply: 21, color: 'w' }),
      okayMove(),
    ];
    const r = buildCoachReport('one-blunder', moves);
    expect(r.moments).toHaveLength(1);
    expect(r.moments[0].classification).toBe('blunder');
    expect(r.biggestMistake).toBe(r.moments[0]);
    expect(r.summary).toContain('1 key moment');
    expect(r.summary).toContain('1 blunder');
    expect(r.summary).toContain('Rd1');
  });

  it('caps at 5 moments sorted by descending winProbDrop; okay moves never appear', () => {
    const drops = [12, 15, 22, 35, 45, 11, 18]; // 7 non-okay moves
    const moves = [
      ...drops.map((d) => mv({ winPctBefore: 60, winPctAfter: 60 - d })),
      okayMove(),
    ];
    const r = buildCoachReport('busy', moves);
    expect(r.moments).toHaveLength(COACH_CONFIG.maxMoments);
    const sorted = [...r.moments].sort((a, b) => b.winProbDrop - a.winProbDrop);
    expect(r.moments).toEqual(sorted);
    expect(r.moments[0].winProbDrop).toBeCloseTo(0.45, 5);
    expect(r.moments.every((m) => m.classification !== 'okay')).toBe(true);
    // The two smallest drops (11, 12) fell off the top-5.
    expect(r.moments.at(-1)!.winProbDrop).toBeCloseTo(0.15, 5);
  });

  it('recurringTags lists only tags occurring >= 2 times', () => {
    const capture = () =>
      mv({ winPctBefore: 70, winPctAfter: 45, playedMove: 'Nf3', bestMove: 'Bxf7' });
    const check = () =>
      mv({ winPctBefore: 70, winPctAfter: 45, playedMove: 'Nf3', bestMove: 'Qb5+' });
    const r = buildCoachReport('recurring', [capture(), capture(), check()]);
    expect(r.recurringTags).toEqual(['missed-capture']);
    expect(r.summary).toContain('missed capture');
  });

  it('fixture: missed mate game tags and reports the mate', () => {
    const moves = [
      okayMove(),
      mv({
        winPctBefore: 100,
        winPctAfter: 55,
        color: 'b',
        ply: 30,
        scoreBefore: { mate: -1 },
        scoreAfter: { cp: 30 },
        playedMove: 'Qd6',
        bestMove: 'Qh2#',
      }),
    ];
    const r = buildCoachReport('missed-mate-game', moves);
    expect(r.moments[0].tags).toContain('missed-mate');
    expect(r.moments[0].advice).toContain('forced mate');
  });

  it('fixture: early-queen mistake game', () => {
    const q = mv({ winPctBefore: 55, winPctAfter: 33, playedMove: 'Qh5', bestMove: 'Nc3', ply: 5, color: 'w' });
    q.moveNumber = 3;
    const r = buildCoachReport('early-queen-game', [okayMove(), q]);
    expect(r.moments[0].tags).toContain('early-queen');
    expect(r.moments[0].advice).toContain('queen out early');
  });

  it('is fully regenerable from stored review data (deterministic, no engine)', () => {
    const moves = [
      mv({ winPctBefore: 58, winPctAfter: 8, ply: 9 }),
      mv({ winPctBefore: 70, winPctAfter: 55, ply: 12 }),
    ];
    const a = buildCoachReport('same', moves);
    const b = buildCoachReport('same', moves);
    expect(b).toEqual(a);
  });
});

// --------------------------- why flagged -----------------------------------

describe('whyFlagged', () => {
  it('produces the win-prob before/after sentence', () => {
    const moment = toCoachMoment(
      mv({ winPctBefore: 62, winPctAfter: 20, color: 'w', playedMove: 'Rd1' })
    )!;
    const s = whyFlagged(moment);
    expect(s).toContain('62%');
    expect(s).toContain('20%');
    expect(s).toContain('Rd1');
    expect(s).toContain('42 points');
    expect(s.toLowerCase()).toContain('blunder');
  });
});
