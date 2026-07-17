import type {
  Color,
  MoveReview,
  PositionAnalysis,
  ReviewedGame,
  Score,
  Settings,
} from '../types';
import type { ParsedGame } from './pgn';
import { uciToSan } from './pgn';
import { legalMoveCount } from './pgn';
import { findOpening } from './openings';
import { classify } from './classify';
import { netSacrifice } from './material';
import { scoreToCp, scoreToEvalPawns } from './winprob';
import { computeStats } from './accuracy';
import type { EnginePool } from '../engine/pool';
import { getCachedAnalysis, putCachedAnalysis } from '../persist/db';

export interface ReviewProgress {
  done: number;
  total: number;
  pass: 'shallow' | 'deep';
}

export interface ReviewCallbacks {
  onProgress?: (p: ReviewProgress) => void;
  onPartial?: (moves: MoveReview[], analyses: (PositionAnalysis | null)[]) => void;
  signal?: { cancelled: boolean };
}

function moverCp(scoreWhite: Score, color: Color): number {
  const cp = scoreToCp(scoreWhite);
  return color === 'w' ? cp : -cp;
}

/** Build per-ply reviews from whatever position analyses are available. */
export function buildReviews(
  game: ParsedGame,
  analyses: (PositionAnalysis | null)[],
  settings: Settings,
  bookPlies: number,
  openingComment?: string
): MoveReview[] {
  const out: MoveReview[] = [];
  for (let i = 0; i < game.plies.length; i++) {
    const ply = game.plies[i];
    const a0 = analyses[i];
    const a1 = analyses[i + 1];
    const color = ply.color as Color;

    if (!a0 || !a1 || a0.lines.length === 0 || a1.lines.length === 0) {
      out.push(pendingReview(ply, color));
      continue;
    }

    const scoreBefore = a0.lines[0].score;
    const scoreAfter = a1.lines[0].score;
    const bestUci = a0.bestUci ?? a0.lines[0].uci[0];
    const replyUci = a1.lines[0].uci[0];

    const multipv = a0.lines.slice(0, 3).map((l) => ({
      uci: l.uci[0],
      san: uciToSan(ply.fenBefore, l.uci[0]) ?? l.uci[0],
      score: l.score,
    }));

    const cpLoss = Math.max(
      0,
      Math.min(2000, moverCp(scoreBefore, color) - moverCp(scoreAfter, color))
    );

    const cls = classify({
      scoreBefore,
      scoreAfter,
      moverColor: color,
      playedUci: ply.uci,
      bestUci,
      secondBestScore: a0.lines[1]?.score,
      legalCount: legalMoveCount(ply.fenBefore),
      isBook: i < bookPlies,
      sacrificedMaterial: netSacrifice(ply.fenBefore, ply.uci, replyUci, color),
      thresholds: settings.thresholds,
    });

    out.push({
      ply: ply.ply,
      moveNumber: ply.moveNumber,
      color,
      fenBefore: ply.fenBefore,
      fenAfter: ply.fenAfter,
      playedMove: ply.san,
      playedUci: ply.uci,
      bestMove: uciToSan(ply.fenBefore, bestUci),
      bestUci,
      multipv,
      evalBefore: scoreToEvalPawns(scoreBefore),
      evalAfter: scoreToEvalPawns(scoreAfter),
      scoreBefore,
      scoreAfter,
      winPctBefore: cls.winPctBefore,
      winPctAfter: cls.winPctAfter,
      cpLoss,
      winPctLoss: cls.winPctLoss,
      classification: cls.classification,
      isBook: i < bookPlies,
      isForced: cls.isForced,
      depth: Math.min(a0.depth, a1.depth),
      comment: i === bookPlies - 1 ? openingComment : undefined,
    });
  }
  return out;
}

function pendingReview(ply: any, color: Color): MoveReview {
  return {
    ply: ply.ply,
    moveNumber: ply.moveNumber,
    color,
    fenBefore: ply.fenBefore,
    fenAfter: ply.fenAfter,
    playedMove: ply.san,
    playedUci: ply.uci,
    multipv: [],
    evalBefore: 0,
    evalAfter: 0,
    winPctBefore: 50,
    winPctAfter: 50,
    cpLoss: 0,
    winPctLoss: 0,
    classification: 'good',
    isBook: false,
    isForced: false,
    depth: 0,
  };
}

/**
 * Two-pass game review: a fast shallow sweep for immediate feedback, then a
 * deep refining pass. Positions are independent, so each pass fans out across
 * every engine in the pool. Emits partial results as positions complete (UI
 * rebuilds are throttled — buildReviews is O(plies) of chess.js work).
 * Honours `signal.cancelled` for abort.
 */
export async function reviewGame(
  game: ParsedGame,
  settings: Settings,
  pool: EnginePool,
  cb: ReviewCallbacks = {}
): Promise<ReviewedGame> {
  await pool.whenReady();

  // Unique positions: start, then each fenAfter.
  const fens: string[] = [game.startFen, ...game.plies.map((p) => p.fenAfter)];
  const analyses: (PositionAnalysis | null)[] = fens.map(() => null);

  const opening = findOpening(game.plies.map((p) => p.san));
  const bookPlies = opening?.bookPlies ?? 0;
  const openingComment = opening ? `${opening.name} (${opening.eco})` : undefined;

  const passes: { depth: number; pass: 'shallow' | 'deep'; movetimeMs?: number }[] = [
    { depth: settings.engine.shallowDepth, pass: 'shallow' },
    {
      depth: settings.engine.deepDepth,
      pass: 'deep',
      movetimeMs: settings.engine.deepMovetimeMs || undefined,
    },
  ];

  let lastPartial = 0;
  const emitPartial = (force = false) => {
    const now = Date.now();
    if (!force && now - lastPartial < 250) return;
    lastPartial = now;
    const partial = buildReviews(game, analyses, settings, bookPlies, openingComment);
    cb.onPartial?.(partial, analyses);
  };

  for (const { depth, pass, movetimeMs } of passes) {
    let nextIdx = 0;
    let done = 0;

    const runOne = async (i: number) => {
      const fen = fens[i];

      // Reuse a cached result computed at exactly this depth if present.
      let analysis = await getCachedAnalysis(fen, depth);

      if (!analysis) {
        analysis = await pool.analyze(fen, {
          depth,
          multiPv: settings.engine.multiPv,
          movetimeMs,
        }).promise;
        if (analysis.lines.length > 0) void putCachedAnalysis(analysis);
      }

      // Keep the deeper of what we already have.
      if (!analyses[i] || analysis.depth >= (analyses[i]!.depth ?? 0)) {
        analyses[i] = analysis;
      }

      done++;
      cb.onProgress?.({ done, total: fens.length, pass });
      emitPartial();
    };

    // One consumer per engine; each pulls the next un-analysed position.
    const consumer = async () => {
      while (nextIdx < fens.length) {
        if (cb.signal?.cancelled) throw new Error('cancelled');
        await runOne(nextIdx++);
      }
    };
    try {
      await Promise.all(Array.from({ length: pool.size }, consumer));
    } catch (e) {
      pool.cancelAll();
      throw e;
    }
    emitPartial(true);
  }

  const moves = buildReviews(game, analyses, settings, bookPlies, openingComment);
  const finalDepth = settings.engine.deepDepth;

  const reviewed: ReviewedGame = {
    id: cryptoId(),
    createdAt: Date.now(),
    tags: game.tags,
    pgn: game.pgn,
    startFen: game.startFen,
    moves,
    white: computeStats(moves, 'w'),
    black: computeStats(moves, 'b'),
    openingName: opening?.name,
    eco: opening?.eco,
    finalDepth,
  };
  return reviewed;
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return crypto.randomUUID();
  return `g_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
