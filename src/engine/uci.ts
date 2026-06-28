import type { PvLine, Score } from '../types';

export interface InfoLine {
  depth?: number;
  multipv?: number;
  score?: Score;
  nodes?: number;
  nps?: number;
  pv?: string[];
}

/** Parse a UCI `info ...` line into structured fields. */
export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith('info ')) return null;
  const tok = line.split(/\s+/);
  const out: InfoLine = {};
  for (let i = 1; i < tok.length; i++) {
    switch (tok[i]) {
      case 'depth':
        out.depth = +tok[++i];
        break;
      case 'multipv':
        out.multipv = +tok[++i];
        break;
      case 'nodes':
        out.nodes = +tok[++i];
        break;
      case 'nps':
        out.nps = +tok[++i];
        break;
      case 'score': {
        const kind = tok[++i];
        const val = +tok[++i];
        out.score = kind === 'mate' ? { mate: val } : { cp: val };
        break;
      }
      case 'pv': {
        out.pv = tok.slice(i + 1);
        i = tok.length;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Extract the move after `bestmove`. Returns undefined for "(none)". */
export function parseBestmove(line: string): string | undefined {
  if (!line.startsWith('bestmove')) return undefined;
  const m = line.split(/\s+/)[1];
  return !m || m === '(none)' ? undefined : m;
}

/** Flip a White-POV score to the side-to-move POV given whose turn it is. */
export function toMoverPov(score: Score, sideToMove: 'w' | 'b'): Score {
  if (sideToMove === 'w') return score;
  return {
    cp: score.cp != null ? -score.cp : undefined,
    mate: score.mate != null ? -score.mate : undefined,
  };
}

/** Engine reports score from side-to-move POV; convert to White POV. */
export function toWhitePov(score: Score, sideToMove: 'w' | 'b'): Score {
  return toMoverPov(score, sideToMove); // symmetric negation
}

/** Merge a freshly-parsed info into the running set of PV lines (by multipv). */
export function mergePvLine(lines: PvLine[], info: InfoLine): PvLine[] {
  if (!info.multipv || !info.pv || !info.score) return lines;
  const next = lines.filter((l) => l.multipv !== info.multipv);
  next.push({ multipv: info.multipv, score: info.score, uci: info.pv });
  next.sort((a, b) => a.multipv - b.multipv);
  return next;
}
