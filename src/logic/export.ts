import type { Classification, MoveReview, ReviewedGame } from '../types';
import { CLASSIFICATION_META } from '../types';
import { formatScore } from './winprob';

const NAG: Partial<Record<Classification, string>> = {
  brilliant: '$3',
  great: '$1',
  best: '$1',
  inaccuracy: '$6',
  mistake: '$2',
  blunder: '$4',
  missed: '$2',
};

/** Build a PGN annotated with eval + classification as comments and NAGs. */
export function toPgnWithComments(game: ReviewedGame): string {
  const tags = { ...game.tags };
  const header = Object.entries(tags)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `[${k} "${v}"]`)
    .join('\n');

  const body: string[] = [];
  for (const m of game.moves) {
    if (m.color === 'w') body.push(`${m.moveNumber}.`);
    let token = m.playedMove;
    const nag = NAG[m.classification];
    if (nag) token += ` ${nag}`;
    body.push(token);
    const evalStr = m.scoreAfter ? formatScore(m.scoreAfter) : '';
    const label = CLASSIFICATION_META[m.classification].label;
    const extra = m.comment ? ` ${m.comment}.` : '';
    body.push(`{ [%eval ${evalStr}] ${label}${extra} }`);
  }
  body.push(game.tags.Result ?? '*');

  return `${header}\n\n${body.join(' ')}\n`;
}

/** Machine-readable JSON report of the whole review. */
export function toJsonReport(game: ReviewedGame): string {
  return JSON.stringify(game, null, 2);
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  triggerDownload(filename, URL.createObjectURL(blob));
}

export function triggerDownload(filename: string, url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Render a shareable PNG summary card and trigger a download. */
export function downloadSummaryPng(game: ReviewedGame) {
  const W = 900;
  const H = 520;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#739552';
  ctx.fillRect(0, 0, W, 8);

  ctx.fillStyle = '#fafafa';
  ctx.font = 'bold 30px ui-sans-serif, system-ui, sans-serif';
  const w = game.tags.White ?? 'White';
  const b = game.tags.Black ?? 'Black';
  ctx.fillText(`${w}  vs  ${b}`, 40, 64);

  ctx.font = '18px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#a3a3a3';
  ctx.fillText(
    `${game.openingName ?? 'Game Review'}${game.eco ? ` · ${game.eco}` : ''} · depth ${game.finalDepth}`,
    40,
    96
  );

  // Accuracy blocks
  const drawPlayer = (label: string, acc: number, est: number | undefined, x: number) => {
    ctx.fillStyle = '#fafafa';
    ctx.font = 'bold 20px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(label, x, 150);
    ctx.font = 'bold 54px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#81b64c';
    ctx.fillText(acc.toFixed(1), x, 210);
    ctx.fillStyle = '#a3a3a3';
    ctx.font = '16px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Accuracy', x, 234);
    if (est) ctx.fillText(`~${est} est. rating`, x, 258);
  };
  drawPlayer(w, game.white.accuracy, game.white.estRating, 40);
  drawPlayer(b, game.black.accuracy, game.black.estRating, 480);

  // Classification counts legend
  let y = 320;
  ctx.font = '16px ui-sans-serif, system-ui, sans-serif';
  const order: Classification[] = [
    'brilliant', 'great', 'best', 'excellent', 'good',
    'inaccuracy', 'mistake', 'missed', 'blunder',
  ];
  ctx.fillStyle = '#fafafa';
  ctx.fillText('White', 40, y - 24);
  ctx.fillText('Black', 480, y - 24);
  for (const cls of order) {
    const meta = CLASSIFICATION_META[cls];
    ctx.fillStyle = meta.color;
    ctx.fillRect(40, y - 12, 12, 12);
    ctx.fillRect(480, y - 12, 12, 12);
    ctx.fillStyle = '#d4d4d4';
    ctx.fillText(`${meta.label}: ${game.white.counts[cls]}`, 60, y);
    ctx.fillText(`${meta.label}: ${game.black.counts[cls]}`, 500, y);
    y += 22;
  }

  ctx.fillStyle = '#525252';
  ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('Generated locally · evals vary with depth/hardware', 40, H - 20);

  triggerDownload(`${w}-vs-${b}-review.png`, c.toDataURL('image/png'));
}

export function classificationCount(moves: MoveReview[], cls: Classification): number {
  return moves.filter((m) => m.classification === cls).length;
}
