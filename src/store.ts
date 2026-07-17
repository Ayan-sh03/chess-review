import { create } from 'zustand';
import { Chess } from 'chess.js';
import type {
  CoachReport,
  MoveReview,
  PositionAnalysis,
  ReviewedGame,
  Settings,
} from './types';
import { Orchestrator } from './engine/orchestrator';
import { EnginePool, defaultPoolSize } from './engine/pool';
import { canUseThreads, pickFlavor, type EngineFlavor } from './engine/stockfish';
import {
  parseMultiGame,
  gameFromFen,
  type ParsedGame,
} from './logic/pgn';
import { reviewGame, buildReviews } from './logic/reviewer';
import { buildCoachReport, COACH_SCHEMA_VERSION } from './logic/coach';
import { uciToMoveObj } from './logic/material';
import {
  loadSettings,
  saveSettings,
  saveGame,
  listGames,
  deleteGame,
  saveCoachReport,
  getCoachReport,
  deleteCoachReport,
} from './persist/db';
import {
  fetchLichessGame,
  fetchLichessUser,
  fetchChessComUser,
  fetchChessComGame,
} from './logic/import';

// Engine lives outside React so it survives re-renders.
let orchestrator: Orchestrator | null = null;
function getOrchestrator(): Orchestrator {
  if (!orchestrator) orchestrator = new Orchestrator();
  return orchestrator;
}

// Separate pool for game review: many engines, one position each. Kept warm
// between reviews; rebuilt if the worker-count setting changes.
let reviewPool: EnginePool | null = null;
let reviewPoolSize = 0;
function getReviewPool(workers: number): EnginePool {
  const size = workers > 0 ? workers : defaultPoolSize();
  if (reviewPool && reviewPoolSize !== size) {
    reviewPool.terminate();
    reviewPool = null;
  }
  if (!reviewPool) {
    reviewPool = new EnginePool(size);
    reviewPoolSize = size;
  }
  return reviewPool;
}

export type ReviewStatus = 'idle' | 'parsing' | 'reviewing' | 'done' | 'error';

interface VariationState {
  baseFen: string;
  baseLabel: string;
  history: { san: string; fen: string }[];
}

interface AppState {
  // engine
  engineFlavor: EngineFlavor;
  threadsAvailable: boolean;

  // settings
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetReviewWithSettings: () => void;

  // input / games
  games: ParsedGame[];
  selectedGameIndex: number;
  selectGame: (i: number) => void;
  inputError: string | null;
  importing: boolean;

  // review
  status: ReviewStatus;
  progress: { done: number; total: number; pass: 'shallow' | 'deep' } | null;
  review: ReviewedGame | null;
  analyses: (PositionAnalysis | null)[];
  coachReport: CoachReport | null;
  errorMsg: string | null;

  // navigation
  currentPly: number; // 0 = start position
  orientation: 'white' | 'black';
  autoplay: boolean;

  // live engine for current position (interactive)
  liveAnalysis: PositionAnalysis | null;

  // variation sandbox
  variation: VariationState | null;

  // saved games
  savedGames: ReviewedGame[];

  // actions
  loadPgn: (pgn: string) => void;
  loadFen: (fen: string) => void;
  importLichessUser: (username: string) => Promise<void>;
  importLichessGame: (idOrUrl: string) => Promise<void>;
  importChessComUser: (username: string) => Promise<void>;
  importChessComGame: (url: string) => Promise<void>;

  startReview: () => Promise<void>;
  cancelReview: () => void;

  goTo: (ply: number) => void;
  next: () => void;
  prev: () => void;
  toStart: () => void;
  toEnd: () => void;
  flip: () => void;
  setMyColor: (color: 'white' | 'black') => void;
  setAutoplay: (on: boolean) => void;

  analyzeCurrent: () => void;

  enterVariation: (uciLine?: string[]) => void;
  playVariationMove: (uci: string) => void;
  popVariation: () => void;
  exitVariation: () => void;

  refreshSaved: () => Promise<void>;
  saveCurrent: () => Promise<void>;
  removeSaved: (id: string) => Promise<void>;
  openSaved: (game: ReviewedGame) => void;
}

let reviewSignal = { cancelled: false };
let liveHandle: { cancel: () => void } | null = null;

function currentGame(state: AppState): ParsedGame | null {
  return state.games[state.selectedGameIndex] ?? null;
}

export function fenAtPly(game: ParsedGame, ply: number): string {
  if (ply <= 0) return game.startFen;
  const p = game.plies[Math.min(ply, game.plies.length) - 1];
  return p ? p.fenAfter : game.startFen;
}

export const useStore = create<AppState>((set, get) => ({
  engineFlavor: pickFlavor(),
  threadsAvailable: canUseThreads(),

  settings: loadSettings(),
  updateSettings: (patch) => {
    const settings = {
      ...get().settings,
      ...patch,
      engine: { ...get().settings.engine, ...(patch.engine ?? {}) },
      thresholds: { ...get().settings.thresholds, ...(patch.thresholds ?? {}) },
    };
    saveSettings(settings);
    set({ settings });
  },
  resetReviewWithSettings: () => {
    // Re-classify the existing review with current thresholds (no re-analysis).
    const { review, games, selectedGameIndex, analyses, settings } = get();
    const game = games[selectedGameIndex];
    if (!review || !game) return;
    const moves = buildReviews(
      game,
      analyses,
      settings,
      review.moves.filter((m) => m.isBook).length,
      review.openingName ? `${review.openingName} (${review.eco})` : undefined
    );
    set({
      review: { ...review, moves },
      coachReport: buildCoachReport(review.id, moves, analyses),
    });
  },

  games: [],
  selectedGameIndex: 0,
  selectGame: (i) => {
    set({ selectedGameIndex: i, status: 'idle', review: null, currentPly: 0, analyses: [], variation: null, coachReport: null });
    get().analyzeCurrent();
    autoOrient();
  },
  inputError: null,
  importing: false,

  status: 'idle',
  progress: null,
  review: null,
  analyses: [],
  coachReport: null,
  errorMsg: null,

  currentPly: 0,
  orientation: 'white',
  autoplay: false,

  liveAnalysis: null,
  variation: null,

  savedGames: [],

  loadPgn: (pgn) => {
    try {
      const games = parseMultiGame(pgn);
      set({ games, selectedGameIndex: 0, inputError: null, status: 'idle', review: null, currentPly: 0, analyses: [], variation: null, coachReport: null });
      autoOrient();
      get().analyzeCurrent();
    } catch (e: any) {
      set({ inputError: e?.message ?? String(e) });
    }
  },
  loadFen: (fen) => {
    try {
      const g = gameFromFen(fen);
      set({ games: [g], selectedGameIndex: 0, inputError: null, status: 'idle', review: null, currentPly: 0, analyses: [], variation: null, coachReport: null });
      get().analyzeCurrent();
    } catch (e: any) {
      set({ inputError: e?.message ?? String(e) });
    }
  },

  importLichessUser: async (u) => wrapImport(set, () => fetchLichessUser(u), get),
  importLichessGame: async (id) => wrapImport(set, () => fetchLichessGame(id), get),
  importChessComUser: async (u) => wrapImport(set, () => fetchChessComUser(u), get),
  importChessComGame: async (url) => wrapImport(set, () => fetchChessComGame(url), get),

  startReview: async () => {
    const game = currentGame(get());
    if (!game || game.plies.length === 0) {
      set({ errorMsg: 'Load a game with moves first.', status: 'error' });
      return;
    }
    reviewSignal = { cancelled: false };
    set({ status: 'reviewing', errorMsg: null, coachReport: null, progress: { done: 0, total: game.plies.length + 1, pass: 'shallow' } });
    try {
      const pool = getReviewPool(get().settings.engine.reviewWorkers);
      const reviewed = await reviewGame(game, get().settings, pool, {
        onProgress: (p) => set({ progress: p }),
        onPartial: (moves, analyses) => {
          const prev = get().review;
          const base: ReviewedGame =
            prev ?? {
              id: 'live', createdAt: Date.now(), tags: game.tags, pgn: game.pgn,
              startFen: game.startFen, moves: [], white: emptyStats(), black: emptyStats(),
              finalDepth: get().settings.engine.deepDepth,
            };
          set({ review: { ...base, moves }, analyses: analyses.slice() });
        },
        signal: reviewSignal,
      });
      set({
        status: 'done',
        review: reviewed,
        coachReport: buildCoachReport(reviewed.id, reviewed.moves, get().analyses),
      });
    } catch (e: any) {
      if (e?.message === 'cancelled') set({ status: 'idle' });
      else set({ status: 'error', errorMsg: e?.message ?? String(e) });
    }
  },
  cancelReview: () => {
    reviewSignal.cancelled = true;
    reviewPool?.cancelAll();
  },

  goTo: (ply) => {
    const game = currentGame(get());
    if (!game) return;
    const clamped = Math.max(0, Math.min(game.plies.length, ply));
    set({ currentPly: clamped, variation: null });
    get().analyzeCurrent();
  },
  next: () => get().goTo(get().currentPly + 1),
  prev: () => get().goTo(get().currentPly - 1),
  toStart: () => get().goTo(0),
  toEnd: () => {
    const g = currentGame(get());
    if (g) get().goTo(g.plies.length);
  },
  flip: () => set({ orientation: get().orientation === 'white' ? 'black' : 'white' }),
  setMyColor: (color) => {
    get().updateSettings({ myColor: color });
    set({ orientation: color });
  },
  setAutoplay: (on) => set({ autoplay: on }),

  analyzeCurrent: () => {
    const game = currentGame(get());
    if (!game) return;
    const fen = get().variation
      ? get().variation!.history.at(-1)?.fen ?? get().variation!.baseFen
      : fenAtPly(game, get().currentPly);
    liveHandle?.cancel();
    const orch = getOrchestrator();
    set({ liveAnalysis: null });
    const { settings } = get();
    const handle = orch.analyze(
      fen,
      { depth: Math.max(settings.engine.deepDepth, 16), multiPv: settings.engine.multiPv, threads: settings.engine.threads, hashMb: settings.engine.hashMb },
      (a) => {
        // Interim engine updates can arrive after the user has moved on;
        // only show them if they match the position on the board.
        if (a.fen === currentFenOf(get())) set({ liveAnalysis: a });
      }
    );
    liveHandle = handle;
    handle.promise.then((a) => {
      // Only commit if still the current position.
      if (a.fen === currentFenOf(get())) set({ liveAnalysis: a });
    });
  },

  enterVariation: (uciLine) => {
    const game = currentGame(get());
    if (!game) return;
    const baseFen = fenAtPly(game, get().currentPly);
    const variation: VariationState = { baseFen, baseLabel: `Move ${get().currentPly}`, history: [] };
    if (uciLine) {
      const chess = new Chess(baseFen);
      for (const uci of uciLine) {
        try {
          const mv = chess.move(uciToMoveObj(uci));
          if (!mv) break;
          variation.history.push({ san: mv.san, fen: chess.fen() });
        } catch {
          break;
        }
      }
    }
    set({ variation });
    get().analyzeCurrent();
  },
  playVariationMove: (uci) => {
    const v = get().variation;
    if (!v) return;
    const fromFen = v.history.at(-1)?.fen ?? v.baseFen;
    try {
      const chess = new Chess(fromFen);
      const mv = chess.move(uciToMoveObj(uci));
      if (!mv) return;
      set({ variation: { ...v, history: [...v.history, { san: mv.san, fen: chess.fen() }] } });
      get().analyzeCurrent();
    } catch {
      /* illegal, ignore */
    }
  },
  popVariation: () => {
    const v = get().variation;
    if (!v) return;
    set({ variation: { ...v, history: v.history.slice(0, -1) } });
    get().analyzeCurrent();
  },
  exitVariation: () => {
    set({ variation: null });
    get().analyzeCurrent();
  },

  refreshSaved: async () => set({ savedGames: await listGames() }),
  saveCurrent: async () => {
    const review = get().review;
    if (!review) return;
    const toSave = review.id === 'live' ? { ...review, id: crypto.randomUUID() } : review;
    await saveGame(toSave);
    // Persist the coach report under the (possibly new) game id.
    const coach = get().coachReport ?? buildCoachReport(toSave.id, toSave.moves, get().analyses);
    const coachToSave = { ...coach, gameId: toSave.id };
    await saveCoachReport(coachToSave);
    set({ review: toSave, coachReport: coachToSave });
    await get().refreshSaved();
  },
  removeSaved: async (id) => {
    await deleteGame(id);
    await deleteCoachReport(id);
    await get().refreshSaved();
  },
  openSaved: (game) => {
    // Reconstruct a ParsedGame-like view from the saved review.
    const plies = game.moves.map((m) => ({
      ply: m.ply, moveNumber: m.moveNumber, color: m.color,
      san: m.playedMove, uci: m.playedUci, fenBefore: m.fenBefore, fenAfter: m.fenAfter,
    }));
    const parsed: ParsedGame = { tags: game.tags, pgn: game.pgn, startFen: game.startFen, plies };
    set({
      games: [parsed], selectedGameIndex: 0, review: game, status: 'done',
      currentPly: 0, analyses: [], variation: null, errorMsg: null, coachReport: null,
    });
    autoOrient();
    get().analyzeCurrent();
    // Coach data is derived: load the persisted report if its schema is
    // current, otherwise regenerate from the stored review.
    void getCoachReport(game.id).then((stored) => {
      if (useStore.getState().review?.id !== game.id) return; // user moved on
      const coach =
        stored && stored.coachSchemaVersion === COACH_SCHEMA_VERSION
          ? stored
          : buildCoachReport(game.id, game.moves);
      set({ coachReport: coach });
    });
  },
}));

// --------------------------- helpers --------------------------------------

function currentFenOf(state: AppState): string {
  const game = state.games[state.selectedGameIndex];
  if (!game) return '';
  if (state.variation) return state.variation.history.at(-1)?.fen ?? state.variation.baseFen;
  return fenAtPly(game, state.currentPly);
}

export function selectCurrentFen(state: AppState): string {
  return currentFenOf(state);
}

function autoOrient() {
  const s = useStore.getState();
  if (!s.settings.autoFlip) return;
  const game = s.games[s.selectedGameIndex];
  if (!game) return;
  useStore.setState({ orientation: s.settings.myColor });
}

function emptyStats() {
  const counts: any = {};
  for (const c of ['brilliant','great','best','excellent','good','book','inaccuracy','mistake','missed','blunder','forced'])
    counts[c] = 0;
  return {
    accuracyAcpl: 0, accuracyWin: 0, accuracy: 0, acpl: 0, counts,
    phase: { opening: -1, middlegame: -1, endgame: -1 },
  };
}

async function wrapImport(
  set: (p: Partial<AppState>) => void,
  fetcher: () => Promise<string>,
  get: () => AppState
) {
  set({ importing: true, inputError: null });
  try {
    const pgn = await fetcher();
    get().loadPgn(pgn);
  } catch (e: any) {
    set({ inputError: e?.message ?? String(e) });
  } finally {
    set({ importing: false });
  }
}
