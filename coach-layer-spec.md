# Coach Layer — Technical Spec

**Owner:** Ayan
**Status:** Ready for implementation
**Prereq:** Game review + engine analysis pipeline already exists (Stockfish WASM, per-move eval, best move / PV available).

---

## 1. Goal

Add a **deterministic coaching layer** on top of the existing engine analysis. It converts raw engine output into a small set of human-readable "coach moments" with classification, tags, and templated advice.

**Hard rule:** The engine and rule system decide all chess truth (best move, tactics, material, mate, classification). No LLM is used to decide anything about chess. LLM is an optional later layer for rewording only — out of scope for this spec.

---

## 2. Scope

### In scope
- Move classification via **win-probability delta** (not raw centipawn drop).
- Selection of top N critical moments.
- Forcing-move pattern detectors (check / capture / mate / early queen).
- Template-based coach messages per classification + tag.
- Final game report (deterministic).
- Coach data persisted alongside existing review data.

### Out of scope (defer to v2)
- Positional detectors (hanging piece, bad trade, king safety, development).
- Any LLM wording layer.
- Multi-language output.
- Puzzle/practice generation (stub links only).

---

## 3. Data contracts

Assumes the existing pipeline already produces, per move:
`fen`, `playedMove` (SAN), `bestMove` (SAN), `evalBefore`, `evalAfter` (centipawns, White POV), `pv` (best line SAN[]), `mateInBefore?`, `mateInAfter?`, `sideToMove` ('w' | 'b').

New types produced by the Coach Layer:

```ts
type CoachClassification = "okay" | "inaccuracy" | "mistake" | "blunder";

type CoachTag =
  | "missed-check"
  | "missed-capture"
  | "missed-mate"
  | "early-queen";

type CoachMoment = {
  moveNumber: number;
  ply: number;
  fen: string;
  sideToMove: "w" | "b";
  playedMove: string;      // SAN
  bestMove: string;        // SAN
  evalBefore: number;      // centipawns, White POV
  evalAfter: number;       // centipawns, White POV
  winProbBefore: number;   // 0..1, from side-to-move POV
  winProbAfter: number;    // 0..1, from side-to-move POV
  winProbDrop: number;     // winProbBefore - winProbAfter, >= 0
  classification: CoachClassification;
  tags: CoachTag[];
  title: string;
  message: string;
  advice: string;
};

type CoachReport = {
  gameId: string;
  moments: CoachMoment[];      // only critical ones, sorted
  summary: string;             // templated top-line
  biggestMistake?: CoachMoment;
  recurringTags: CoachTag[];   // tags appearing >= 2x
};
```

---

## 4. Core logic

### 4.1 Eval → win probability

Convert centipawns to a win probability from the moving side's POV before classifying. This is the single most important correction over raw eval-drop.

```ts
// White-POV centipawns -> win prob for the side to move
function winProb(cp: number, sideToMove: "w" | "b"): number {
  const pov = sideToMove === "w" ? cp : -cp;
  // Standard logistic; k tuned to ~1/400 scale used by Lichess.
  return 1 / (1 + Math.pow(10, -pov / 400));
}
```

Mate scores must be clamped to a near-certain win/loss (e.g. mate-in-n for the side to move → winProb ≈ 1.0, mate against → ≈ 0.0) rather than fed through the logistic.

### 4.2 Classification (win-prob delta)

```ts
function classify(drop: number): CoachClassification {
  if (drop >= 0.30) return "blunder";
  if (drop >= 0.20) return "mistake";
  if (drop >= 0.10) return "inaccuracy";
  return "okay";
}
```

Thresholds are config constants, not magic numbers. Starting values above; tune against a labelled set of your own games.

### 4.3 Critical moment selection

```ts
const moments = allMoves
  .map(toCoachMoment)
  .filter(m => m.classification !== "okay")
  .sort((a, b) => b.winProbDrop - a.winProbDrop)
  .slice(0, 5);
```

### 4.4 Tag detectors (forcing moves only, v1)

All detectors are pure functions of already-available data (SAN strings + engine PV + move number). No board re-computation beyond what chess.js already gives.

- **missed-mate:** `mateInAfter` was available for the moving side in `bestMove` line but not played.
- **missed-check:** `bestMove` ends in `+` or `#` and `playedMove` does not, AND move is classified worse than `okay`.
- **missed-capture:** `bestMove` contains `x` and `playedMove` does not, AND classified worse than `okay`.
- **early-queen:** `playedMove` is a queen move (`startsWith("Q")`), `moveNumber <= 10`, and classified worse than `okay`.

A moment can carry multiple tags. Tags are additive to classification, they don't override it.

### 4.5 Templates

Keep a `templates` map keyed by classification for the base message, and a `tagAdvice` map keyed by tag for the advice line. **Templates describe the observed engine fact only** — they must not assert *why* the best move is good (the engine never told us that).

```ts
const templates: Record<CoachClassification, {title: string; message: string}> = {
  blunder:    { title: "Big swing",      message: "This move sharply changed the position in your opponent's favor." },
  mistake:    { title: "Mistake",        message: "This move gave away part of your advantage." },
  inaccuracy: { title: "Small slip",     message: "Playable, but there was a stronger move." },
  okay:       { title: "OK",             message: "" },
};

const tagAdvice: Record<CoachTag, string> = {
  "missed-mate":    "A forced mate was available. Scan forcing checks near the king first.",
  "missed-check":   "A checking move was stronger here. Always look at checks before quiet moves.",
  "missed-capture": "A capture was available and stronger. Check captures before quiet moves.",
  "early-queen":    "Moving the queen out early lets your opponent gain time by attacking it.",
};
```

### 4.6 Report assembly

`summary`, `biggestMistake` (highest `winProbDrop`), and `recurringTags` (any tag count >= 2) are all deterministic string templates. No free-form generation.

---

## 5. Persistence

Store `CoachReport` keyed by `gameId` in the same store used by the existing review (IndexedDB). Coach data is derived — regenerable from stored engine analysis, so no migration risk. Version the schema with a `coachSchemaVersion` field so re-analysis can be triggered if thresholds/detectors change.

---

## 6. UI

Minimal, deterministic. No chat.

- **Coach summary card:** "Your coach found N key moments." + top-line summary + biggest mistake.
- **Moment list:** one card per `CoachMoment` — move number, played vs best, classification badge, tags as chips, message + advice.
- **Per-moment buttons** (each shows deterministic content, no generation):
  - `Why was this flagged?` → win-prob before/after sentence.
  - `Show best move` → highlight `bestMove` on board.
  - `Show engine line` → step through `pv`.
- Jump-to-board: clicking a moment sets the existing review board to that `fen`.

---

## 7. Acceptance criteria

**Classification**
- [ ] Every analyzed move receives exactly one classification.
- [ ] Classification is computed from **win-probability delta**, not raw centipawn drop. A drop from +800cp to +500cp (still winning) is NOT a blunder; a swing from +30cp to −150cp is flagged appropriately.
- [ ] Mate scores are clamped, not passed through the logistic (no absurd win-prob for mate positions).
- [ ] Classification is POV-correct: a move is judged from the moving side's perspective, regardless of board orientation.
- [ ] Thresholds live in a single config object, not inline literals.

**Moment selection**
- [ ] At most 5 moments shown, sorted by descending `winProbDrop`.
- [ ] `okay` moves never appear as moments.
- [ ] A game with zero non-okay moves produces an empty moment list and a valid "clean game" summary (no crash, no empty card).

**Tags**
- [ ] `missed-mate`, `missed-check`, `missed-capture`, `early-queen` each fire only when their documented condition holds AND the move is worse than `okay`.
- [ ] A moment may carry multiple tags; each rendered as a distinct chip.
- [ ] Tags never assert a chess rationale the engine did not provide (spot-check template text).

**Report**
- [ ] `biggestMistake` = the moment with the highest `winProbDrop` (or undefined if none).
- [ ] `recurringTags` lists only tags occurring >= 2 times across moments.
- [ ] Report is fully regenerable from stored engine analysis with no LLM call.

**UI**
- [ ] Clicking a moment navigates the existing review board to its `fen`.
- [ ] `Show best move` and `Show engine line` render from stored `bestMove` / `pv` with no re-analysis.
- [ ] Coach layer adds no blocking call to the render path — it reads persisted `CoachReport`.

**Non-goals verified**
- [ ] No LLM/network call anywhere in the coach path.
- [ ] No positional detectors (hanging piece, bad trade, king safety, development) shipped in v1.

---

## 8. Build order

1. `winProb` + mate clamping + `classify` + config constants. (unit-tested)
2. `toCoachMoment` mapper + critical-moment selection.
3. Forcing-move tag detectors.
4. Templates + report assembly.
5. Persistence (`CoachReport` in IndexedDB, versioned).
6. UI cards + board jump + per-moment buttons.

Each step is independently testable against existing analyzed games.

---

## 9. Test fixtures

Provide 3–4 of your own analyzed games as fixtures covering: a clean game (no moments), a single decisive blunder, a game with a missed mate, and a game with an early-queen mistake. Detector and classification unit tests run against these fixed engine outputs so results are reproducible without re-running Stockfish.
