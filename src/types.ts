// ---------------------------------------------------------------------------
// Shared domain types for the engine, classification and UI layers.
// ---------------------------------------------------------------------------

export type Color = 'w' | 'b';

/** An evaluation from White's point of view. Either a centipawn score or a
 *  forced-mate distance. `mate` is in moves: +3 = White mates in 3. */
export interface Score {
  cp?: number; // centipawns, White POV
  mate?: number; // mate in N (signed), White POV
}

/** One engine principal-variation line. */
export interface PvLine {
  multipv: number; // 1-based rank
  score: Score; // White POV
  uci: string[]; // moves in UCI
  san?: string[]; // moves in SAN (filled lazily for display)
}

/** Raw analysis output for a single position (a FEN). */
export interface PositionAnalysis {
  fen: string;
  depth: number;
  nodes?: number;
  nps?: number;
  lines: PvLine[]; // sorted by multipv asc; [0] is best
  bestUci?: string;
  complete: boolean; // true once the deep pass finished this position
}

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'missed'
  | 'blunder'
  | 'forced';

/** Per-ply review record (the enhanced data model from the spec). */
export interface MoveReview {
  ply: number; // 1-based half-move index
  moveNumber: number; // full-move number
  color: Color; // side that moved
  fenBefore: string;
  fenAfter: string;
  playedMove: string; // SAN
  playedUci: string;
  bestMove?: string; // SAN of engine best at fenBefore
  bestUci?: string;
  multipv: { uci: string; san: string; score: Score }[];
  evalBefore: number; // White POV, in pawns (clamped for mate)
  evalAfter: number; // White POV, in pawns
  scoreBefore?: Score;
  scoreAfter?: Score;
  winPctBefore: number; // mover POV win chance 0..100 BEFORE moving
  winPctAfter: number; // mover POV win chance 0..100 AFTER moving
  cpLoss: number; // mover POV centipawns lost (>= 0)
  winPctLoss: number; // mover POV win% lost (>= 0)
  classification: Classification;
  isBook: boolean;
  isForced: boolean;
  depth: number;
  comment?: string; // opening name etc.
}

export interface GameTags {
  White?: string;
  Black?: string;
  Result?: string;
  Date?: string;
  Event?: string;
  Site?: string;
  WhiteElo?: string;
  BlackElo?: string;
  ECO?: string;
  Opening?: string;
  [k: string]: string | undefined;
}

export interface PhaseStats {
  opening: number; // accuracy 0..100 (NaN-safe: -1 when no moves)
  middlegame: number;
  endgame: number;
}

export interface PlayerStats {
  accuracyAcpl: number; // 0..100
  accuracyWin: number; // 0..100 (win%-loss model)
  accuracy: number; // blended (chess.com-style)
  acpl: number; // raw average centipawn loss
  counts: Record<Classification, number>;
  phase: PhaseStats;
  estRating?: number;
}

export interface ReviewedGame {
  id: string;
  createdAt: number;
  tags: GameTags;
  pgn: string;
  startFen: string;
  moves: MoveReview[];
  white: PlayerStats;
  black: PlayerStats;
  openingName?: string;
  eco?: string;
  finalDepth: number;
}

// --------------------------- settings -------------------------------------

/** Thresholds operate on win% loss (mover POV). All tunable in Settings. */
export interface Thresholds {
  // win% loss upper bounds (inclusive) for each band
  best: number; // <= -> treated as essentially best
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  // anything above `mistake` is a blunder
  greatMinSwing: number; // min win% the "only move" must preserve to be Great
  brilliantMinSacrifice: number; // min material (pawns) sacrificed for Brilliant
  missedWinThreshold: number; // win% at which a position is "winning"
}

export interface EngineSettings {
  shallowDepth: number;
  deepDepth: number;
  multiPv: number;
  threads: number; // used only when multi-threaded build is active
  hashMb: number;
}

export interface Settings {
  engine: EngineSettings;
  thresholds: Thresholds;
  boardLight: string;
  boardDark: string;
  autoFlip: boolean;
  showArrows: boolean;
  showMultiPvArrows: boolean;
  autoplayMs: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  best: 1,
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
  greatMinSwing: 50,
  brilliantMinSacrifice: 1.5,
  missedWinThreshold: 75,
};

export const DEFAULT_SETTINGS: Settings = {
  engine: { shallowDepth: 12, deepDepth: 18, multiPv: 3, threads: 4, hashMb: 64 },
  thresholds: DEFAULT_THRESHOLDS,
  boardLight: '#ebecd0',
  boardDark: '#739552',
  autoFlip: true,
  showArrows: true,
  showMultiPvArrows: true,
  autoplayMs: 900,
};

// --------------------------- classification meta --------------------------

export const CLASSIFICATION_META: Record<
  Classification,
  { label: string; symbol: string; color: string; glyph: string }
> = {
  brilliant: { label: 'Brilliant', symbol: '!!', color: '#26c6da', glyph: '!!' },
  great: { label: 'Great', symbol: '!', color: '#22a7f0', glyph: '!' },
  best: { label: 'Best', symbol: '★', color: '#81b64c', glyph: '★' },
  excellent: { label: 'Excellent', symbol: '✓', color: '#95bb4a', glyph: '✓' },
  good: { label: 'Good', symbol: '·', color: '#a3a3a3', glyph: '·' },
  book: { label: 'Book', symbol: '📖', color: '#a88865', glyph: '♟' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f7c045', glyph: '?!' },
  mistake: { label: 'Mistake', symbol: '?', color: '#e58f2a', glyph: '?' },
  missed: { label: 'Missed Win', symbol: '✕', color: '#d96b2b', glyph: '✕' },
  blunder: { label: 'Blunder', symbol: '??', color: '#d64545', glyph: '??' },
  forced: { label: 'Forced', symbol: '□', color: '#8a8a8a', glyph: '□' },
};
