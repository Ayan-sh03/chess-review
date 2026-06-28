# Chess Game Review

A personal, **100% client-side** chess analysis app that mimics chess.com's "Game
Review". Paste a PGN (or FEN, or import from Lichess/Chess.com), and it runs a
two-pass Stockfish 16 NNUE analysis entirely in your browser, classifies every
move, and produces an accuracy report with replayable insights and exports.

No backend. No live play. The engine runs on your CPU in a Web Worker.

## Features

- **Input** — paste PGN, drag-and-drop `.pgn`, load a FEN, multi-game selector,
  or import from the public Lichess / Chess.com APIs (username or game URL).
- **Engine** — Stockfish 16 NNUE in a Web Worker.
  - Single-threaded WASM by default; upgrades to the **multi-threaded
    (SharedArrayBuffer)** build automatically when COOP/COEP headers make the
    page cross-origin isolated. Falls back to a no-SIMD build when needed.
  - **Two-pass** scheduler: a fast shallow sweep (depth ~12) for instant
    feedback, then a deep refining pass (depth ~18). UI updates live.
  - **MultiPV** top-3 lines; analysis cache (FEN+depth) in IndexedDB; cancellable
    jobs when you navigate mid-analysis.
- **Classification** — win-probability model (logistic) rather than raw
  centipawns. Brilliant / Great / Best / Excellent / Good / Inaccuracy / Mistake
  / Blunder / Missed Win / Book / Forced. **All thresholds are tunable** in
  Settings, and you can re-classify without re-analysing.
- **Accuracy & stats** — per-player accuracy (win-model + ACPL + blended),
  per-classification counts, opening/middlegame/endgame phase breakdown, rough
  estimated rating.
- **Board & navigation** — interactive board, flip, clickable move list, prev /
  next / start / end, keyboard arrows, autoplay with adjustable speed, and a
  **variation explorer** (click an engine line or drag pieces to play it out in a
  sandbox without losing the main game).
- **Visual aids** — best-move + secondary MultiPV arrows, played-move highlights,
  classification badges on the board and in the move list, eval bar, and a
  **recharts eval graph** (click a point to jump; blunders/brilliancies marked).
- **Reporting / persistence** — save reviews locally (IndexedDB), export
  PGN-with-comments (`{ [%eval ...] }` + NAGs), JSON, or a PNG summary card.
  Settings persist in localStorage.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm run preview  # serve the production build
npm test         # unit tests (classification, win%, SAN/UCI, accuracy)
```

The dev server sets the COOP/COEP headers needed for multithreading. For
production, the included `public/_headers` (Cloudflare Pages) and `vercel.json`
do the same. Without them the app still works on the single-threaded build.

## Engine assets

The Stockfish builds and the ~40 MB NNUE network live in `public/stockfish/`
(copied from the `stockfish` npm package). They are served same-origin so they
satisfy COEP `require-corp`.

## Determinism caveat

Evaluations vary with engine depth and hardware. Reports record the depth they
were generated at — pin the same depth/nodes in Settings for reproducible
numbers.

## Tech

Vite · React · TypeScript · Tailwind · Zustand · chess.js · react-chessboard ·
recharts · Stockfish 16 NNUE (WASM).
