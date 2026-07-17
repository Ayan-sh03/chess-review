# CLAUDE.md

Chess game review app (Chess.com-style "Game Review"): load a PGN/FEN or import
from Lichess/Chess.com, run a local Stockfish 16 (WASM) analysis, and browse
the game with classifications, eval graph, and arrows. Deployed on Vercel.

## Commands

```bash
npm run dev        # Vite dev server (http://localhost:5173)
npm run build      # tsc -b && vite build
npm run test       # vitest run (unit tests live next to src/logic modules)
```

## Deploy

- GitHub: `Ayan-sh03/chess-review`, branch `master` (no PR flow — direct pushes).
- Vercel: project `chess-review`, already linked (`.vercel/`), CLI logged in as
  `ayan-sh03`. Production = `git push origin master` **and** `vercel --prod --yes`
  (the git push alone does not deploy; the CLI deploy is what ships).
- Live: https://chess-review-peach.vercel.app

## Architecture

- `src/store.ts` — single Zustand store: games, navigation (`currentPly`,
  `orientation`), review results, live analysis, variation sandbox, settings.
  All actions live here; components stay thin.
- `src/logic/` — pure, unit-tested modules (pgn, classify, winprob, accuracy,
  openings, reviewer). New pure logic goes here with a `.test.ts` beside it.
- `src/engine/` — Stockfish worker plumbing (uci, orchestrator, pool). Engine
  flavor (threaded vs single) is picked at startup from browser capabilities.
  Live analysis uses one Orchestrator; game review fans positions out across an
  `EnginePool` of parallel workers (auto-sized to CPU cores, 2 threads each),
  with a per-position `deepMovetimeMs` cap bounding the deep pass.
- `src/components/` — Board, MoveList, NavControls, EvalBar/EvalGraph, panels.
- `src/persist/db.ts` — saved games in IndexedDB; settings in localStorage under
  `chess-review-settings`.
- `src/types.ts` — shared types, `Settings`/`DEFAULT_SETTINGS`,
  `CLASSIFICATION_META` (colors/symbols per move classification).

## Conventions & gotchas

- **New settings fields**: add to `Settings` *and* `DEFAULT_SETTINGS` in
  `src/types.ts`. `loadSettings()` deep-merges saved settings over defaults, so
  older saved blobs pick up new fields automatically — no migration needed.
- **Arrow semantics on the board** (`src/components/Board.tsx`):
  - Orange arrow = the move actually played (shown for both sides).
  - Blue arrow = engine best move, shown **only for the user's side**
    (`settings.myColor`, set via the ♔/♚ "I play" toggle in NavControls). For a
    played move the mover is the ply's `color`; otherwise it's the side to move
    from the FEN. Never show the opponent's suggestions.
  - Live analysis results must match the current FEN before drawing — stale
    engine output must never reach the board.
- **Orientation**: `setMyColor` flips the board to that color; `autoOrient()`
  (runs on game load when `settings.autoFlip`) orients to `settings.myColor`.
  Don't hardcode `'white'`.
- **Move list must never scroll the page** (`src/components/MoveList.tsx`):
  follow-the-active-move scrolling adjusts only the list's own scrollbox
  (`scrollTop` math, not `scrollIntoView`, which also scrolls page ancestors),
  and move buttons blur themselves after click so arrow-key navigation keeps
  the board in view.
- Global keyboard nav (arrows/home/end/space) is a window-level listener in
  `src/ui/hooks.ts`; it ignores INPUT/TEXTAREA/SELECT targets only, so any
  focusable control you add must not trap or repurpose those keys.
- Tests cover pure logic only; UI changes are verified by driving the dev
  server (typecheck + `vitest run` at minimum before shipping).
