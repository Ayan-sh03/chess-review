// ---------------------------------------------------------------------------
// Coach layer: converts engine review data into a small set of human-readable
// "coach moments". Fully deterministic — the engine decides all chess truth;
// this module only classifies, tags and templates it. No LLM, no network.
// ---------------------------------------------------------------------------

import { Chess } from 'chess.js';
import type {
  CoachClassification,
  CoachMoment,
  CoachReport,
  CoachTag,
  Color,
  MoveReview,
  PositionAnalysis,
  Score,
} from '../types';
import { scoreToCp } from './winprob';

// --------------------------- config ---------------------------------------

/** Win-probability drop thresholds (0..1, mover POV). Single source of truth. */
export const COACH_THRESHOLDS = {
  blunder: 0.3,
  mistake: 0.2,
  inaccuracy: 0.1,
} as const;

export const COACH_CONFIG = {
  maxMoments: 5, // top-N critical moments shown
  earlyQueenMaxMoveNumber: 10, // "early queen" window (full-move number)
  recurringTagMin: 2, // tag count needed to call it recurring
  pvMaxPlies: 8, // engine-line length surfaced to the user
} as const;

/** Bump when thresholds/detectors/templates change so stale persisted
 *  reports are regenerated instead of reused. */
export const COACH_SCHEMA_VERSION = 1;

export const COACH_CLASS_META: Record<
  CoachClassification,
  { label: string; color: string }
> = {
  blunder: { label: 'Blunder', color: '#d64545' },
  mistake: { label: 'Mistake', color: '#e58f2a' },
  inaccuracy: { label: 'Inaccuracy', color: '#f7c045' },
  okay: { label: 'OK', color: '#8a8a8a' },
};

// --------------------------- classification -------------------------------

/** Classify a mover-POV win-probability drop (0..1). */
export function classifyCoach(drop: number): CoachClassification {
  if (drop >= COACH_THRESHOLDS.blunder) return 'blunder';
  if (drop >= COACH_THRESHOLDS.mistake) return 'mistake';
  if (drop >= COACH_THRESHOLDS.inaccuracy) return 'inaccuracy';
  return 'okay';
}

// --------------------------- tag detectors (v1: forcing moves only) --------

function mateForMover(score: Score | undefined, mover: Color): boolean {
  if (score?.mate == null || score.mate === 0) return false;
  return mover === 'w' ? score.mate > 0 : score.mate < 0;
}

/** All detectors are pure functions of already-computed review data. They
 *  only fire on moves classified worse than `okay` (enforced by the caller
 *  via `detectTags` being applied to non-okay moments only, and re-checked
 *  here for safety). */
export function detectTags(
  m: MoveReview,
  cls: CoachClassification
): CoachTag[] {
  if (cls === 'okay') return [];
  const tags: CoachTag[] = [];
  const best = m.bestMove;
  const played = m.playedMove;
  const differs = !!best && best !== played;

  // A forced mate was available for the mover but the played move let it go.
  if (
    differs &&
    mateForMover(m.scoreBefore, m.color) &&
    !mateForMover(m.scoreAfter, m.color)
  ) {
    tags.push('missed-mate');
  }
  // Best move gives check (or mate) and the played move does not.
  if (differs && /[+#]$/.test(best!) && !/[+#]$/.test(played)) {
    tags.push('missed-check');
  }
  // Best move is a capture and the played move is not.
  if (differs && best!.includes('x') && !played.includes('x')) {
    tags.push('missed-capture');
  }
  // Queen move in the first N full moves that loses win probability.
  if (
    played.startsWith('Q') &&
    m.moveNumber <= COACH_CONFIG.earlyQueenMaxMoveNumber
  ) {
    tags.push('early-queen');
  }
  return tags;
}

// --------------------------- templates ------------------------------------
// Templates describe the observed engine facts only (evals, win chances,
// which move the engine preferred). They never assert WHY a move is good —
// the engine did not tell us that.

const pct = (p: number) => `${Math.round(p * 100)}%`;
const pts = (p: number) => `${Math.round(p * 100)}`;

const TEMPLATES: Record<
  CoachClassification,
  { title: string; message: (m: CoachMoment) => string }
> = {
  blunder: {
    title: 'Big swing',
    message: (m) =>
      `This move sharply changed the position in your opponent's favor: ` +
      `your winning chances fell from ${pct(m.winProbBefore)} to ${pct(m.winProbAfter)}. ` +
      `The engine preferred ${m.bestMove}.`,
  },
  mistake: {
    title: 'Mistake',
    message: (m) =>
      `This move gave away part of your advantage — winning chances dropped ` +
      `from ${pct(m.winProbBefore)} to ${pct(m.winProbAfter)}. ` +
      `${m.bestMove} was the engine's choice here.`,
  },
  inaccuracy: {
    title: 'Small slip',
    message: (m) =>
      `Playable, but there was a stronger move: ${m.bestMove}. ` +
      `Winning chances slipped from ${pct(m.winProbBefore)} to ${pct(m.winProbAfter)}.`,
  },
  okay: { title: 'OK', message: () => '' },
};

export const TAG_ADVICE: Record<CoachTag, string> = {
  'missed-mate':
    'A forced mate was available. Scan forcing checks near the enemy king first.',
  'missed-check':
    'A checking move was stronger here. Always look at checks before quiet moves.',
  'missed-capture':
    'A capture was available and stronger. Check captures before quiet moves.',
  'early-queen':
    'Moving the queen out early lets your opponent gain time by attacking it.',
};

export const TAG_LABEL: Record<CoachTag, string> = {
  'missed-mate': 'Missed mate',
  'missed-check': 'Missed check',
  'missed-capture': 'Missed capture',
  'early-queen': 'Early queen',
};

/** Generic advice when no forcing-move tag fired. Coaching habits, not
 *  position-specific claims. */
const FALLBACK_ADVICE: Record<CoachClassification, string> = {
  blunder:
    "Before committing to a move, run a quick blunder check: list your opponent's checks, captures and threats in reply.",
  mistake:
    'Slow down at tense moments — step through the engine line afterwards to see what the position demanded.',
  inaccuracy:
    'Small slips add up. When two moves look equally good, spend one extra look on the more forcing option.',
  okay: '',
};

/** Deterministic "Why was this flagged?" sentence for the UI. */
export function whyFlagged(m: CoachMoment): string {
  const threshold = COACH_THRESHOLDS[m.classification as keyof typeof COACH_THRESHOLDS];
  const side = m.sideToMove === 'w' ? 'White' : 'Black';
  return (
    `${side}'s winning chances were ${pct(m.winProbBefore)} before this move and ` +
    `${pct(m.winProbAfter)} after ${m.playedMove} — a drop of ${pts(m.winProbDrop)} points, ` +
    `past the ${COACH_CLASS_META[m.classification].label.toLowerCase()} threshold of ${pts(threshold ?? 0)}.`
  );
}

// --------------------------- moment mapping -------------------------------

function pvToSan(fen: string, pvUci: string[]): string[] {
  const out: string[] = [];
  try {
    const chess = new Chess(fen);
    for (const uci of pvUci) {
      const mv = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? (uci[4] as any) : undefined,
      });
      if (!mv) break;
      out.push(mv.san);
    }
  } catch {
    /* partial line is fine */
  }
  return out;
}

/** Map one reviewed move to a CoachMoment. Returns null when there is no
 *  engine data to coach from (pending analysis, forced move, no best move). */
export function toCoachMoment(
  m: MoveReview,
  analysisBefore?: PositionAnalysis | null
): CoachMoment | null {
  if (!m.bestMove || !m.bestUci || m.depth <= 0) return null;
  if (m.isForced) return null; // only one legal move — nothing to coach

  const winProbBefore = m.winPctBefore / 100;
  const winProbAfter = m.winPctAfter / 100;
  const winProbDrop = Math.max(0, winProbBefore - winProbAfter);
  const classification = classifyCoach(winProbDrop);

  const pvUci =
    analysisBefore?.lines?.[0]?.uci?.slice(0, COACH_CONFIG.pvMaxPlies) ?? [
      m.bestUci,
    ];

  const moment: CoachMoment = {
    moveNumber: m.moveNumber,
    ply: m.ply,
    fen: m.fenBefore,
    fenAfter: m.fenAfter,
    sideToMove: m.color,
    playedMove: m.playedMove,
    playedUci: m.playedUci,
    bestMove: m.bestMove,
    bestUci: m.bestUci,
    pvUci,
    pvSan: pvToSan(m.fenBefore, pvUci),
    evalBefore: m.scoreBefore ? scoreToCp(m.scoreBefore) : Math.round(m.evalBefore * 100),
    evalAfter: m.scoreAfter ? scoreToCp(m.scoreAfter) : Math.round(m.evalAfter * 100),
    winProbBefore,
    winProbAfter,
    winProbDrop,
    classification,
    tags: [],
    title: '',
    message: '',
    advice: '',
  };

  moment.tags = detectTags(m, classification);
  moment.title = TEMPLATES[classification].title;
  moment.message = TEMPLATES[classification].message(moment);
  moment.advice =
    moment.tags.length > 0
      ? moment.tags.map((t) => TAG_ADVICE[t]).join(' ')
      : FALLBACK_ADVICE[classification];
  return moment;
}

// --------------------------- report assembly ------------------------------

function countWord(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function summarize(moments: CoachMoment[], recurring: CoachTag[]): string {
  if (moments.length === 0) {
    return (
      'Clean game — no key moments to flag. No move dropped winning chances ' +
      `by more than ${pts(COACH_THRESHOLDS.inaccuracy)} points. Well played!`
    );
  }
  const counts: Record<string, number> = {};
  for (const m of moments) counts[m.classification] = (counts[m.classification] ?? 0) + 1;
  const parts = (['blunder', 'mistake', 'inaccuracy'] as const)
    .filter((c) => counts[c])
    .map((c) => countWord(counts[c], c));
  const list =
    parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
      : parts[0];

  const top = moments[0];
  const side = top.sideToMove === 'w' ? 'White' : 'Black';
  let s =
    `Your coach found ${countWord(moments.length, 'key moment')}: ${list}. ` +
    `The biggest swing was on move ${top.moveNumber} (${side} played ${top.playedMove}), ` +
    `where winning chances fell by ${pts(top.winProbDrop)} points.`;
  if (recurring.length > 0) {
    s += ` Recurring theme: ${recurring.map((t) => TAG_LABEL[t].toLowerCase()).join(', ')}.`;
  }
  return s;
}

/**
 * Build the full deterministic coach report from reviewed moves. `analyses`
 * (when available, indexed by position: analyses[ply-1] = position before
 * that ply) enriches moments with the engine PV; without it the best move
 * alone is used. Regenerable at any time — no engine or network calls.
 */
export function buildCoachReport(
  gameId: string,
  moves: MoveReview[],
  analyses?: (PositionAnalysis | null)[]
): CoachReport {
  const moments = moves
    .map((m, i) => toCoachMoment(m, analyses?.[i]))
    .filter((m): m is CoachMoment => m != null && m.classification !== 'okay')
    .sort((a, b) => b.winProbDrop - a.winProbDrop)
    .slice(0, COACH_CONFIG.maxMoments);

  const tagCounts = new Map<CoachTag, number>();
  for (const m of moments)
    for (const t of m.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const recurringTags = [...tagCounts.entries()]
    .filter(([, n]) => n >= COACH_CONFIG.recurringTagMin)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  return {
    gameId,
    coachSchemaVersion: COACH_SCHEMA_VERSION,
    moments,
    summary: summarize(moments, recurringTags),
    biggestMistake: moments[0],
    recurringTags,
  };
}
