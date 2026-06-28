import { useStore, selectCurrentFen } from '../store';
import { uciLineToSan } from '../logic/pgn';
import { formatScore, winPctWhite } from '../logic/winprob';
import { Section, Pill } from '../ui/common';

export default function EnginePanel() {
  const { liveAnalysis, engineFlavor, threadsAvailable, enterVariation } = useStore();
  const fen = useStore(selectCurrentFen);
  const a = liveAnalysis;

  const flavorLabel =
    engineFlavor === 'threaded' ? 'multi-threaded (SAB)' :
    engineFlavor === 'single' ? 'single-thread WASM' : 'single-thread (no SIMD)';

  return (
    <div className="space-y-3">
      <Section
        title="Engine"
        right={
          <Pill color={threadsAvailable ? '#81b64c' : '#f7c045'}>{flavorLabel}</Pill>
        }
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
          <span>Depth <b className="text-neutral-200">{a?.depth ?? 0}</b></span>
          <span>Nodes <b className="text-neutral-200">{fmt(a?.nodes)}</b></span>
          <span>NPS <b className="text-neutral-200">{fmt(a?.nps)}</b></span>
          <span className={a?.complete ? 'text-emerald-400' : 'text-amber-400'}>
            {a ? (a.complete ? '● done' : '● analyzing…') : '○ idle'}
          </span>
        </div>
      </Section>

      <Section title="Top lines (MultiPV)">
        {!a || a.lines.length === 0 ? (
          <p className="text-xs text-neutral-600">Navigate to a position to analyze.</p>
        ) : (
          <ol className="space-y-1.5">
            {a.lines.slice(0, 3).map((line) => {
              const san = uciLineToSan(fen, line.uci.slice(0, 12));
              return (
                <li key={line.multipv} className="flex items-start gap-2 text-sm">
                  <span
                    className="mt-0.5 w-12 shrink-0 rounded px-1 text-center text-xs font-bold tabular-nums"
                    style={{ background: '#1f2937', color: scoreColor(line.score.cp, line.score.mate) }}
                  >
                    {formatScore(line.score)}
                  </span>
                  <button
                    onClick={() => enterVariation(line.uci)}
                    className="text-left font-mono text-xs leading-5 text-neutral-300 hover:text-emerald-300"
                    title="Play this line out on the board"
                  >
                    {san.map((s, i) => (
                      <span key={i} className="mr-1">
                        {(i % 2 === 0) && <span className="text-neutral-600">{Math.floor(i / 2) + 1}.</span>} {s}
                      </span>
                    ))}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {a?.lines[0] && (
        <Section title="Win / Draw / Loss (White)">
          <Wdl cp={a.lines[0].score.cp} mate={a.lines[0].score.mate} />
        </Section>
      )}
    </div>
  );
}

function Wdl({ cp, mate }: { cp?: number; mate?: number }) {
  const w = winPctWhite({ cp, mate });
  const loss = 100 - w;
  const draw = Math.max(0, 100 - Math.abs(w - loss)) * 0.4;
  const scale = (100 - draw) / 100;
  const win = w * scale;
  const los = loss * scale;
  return (
    <div className="space-y-1">
      <div className="flex h-4 overflow-hidden rounded text-[10px] font-bold text-neutral-900">
        <div style={{ width: `${win}%`, background: '#e5e5e5' }} className="flex items-center justify-center">
          {win > 12 ? `${win.toFixed(0)}%` : ''}
        </div>
        <div style={{ width: `${draw}%`, background: '#737373' }} />
        <div style={{ width: `${los}%`, background: '#404040' }} className="flex items-center justify-center text-neutral-200">
          {los > 12 ? `${los.toFixed(0)}%` : ''}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span>Win {win.toFixed(0)}%</span>
        <span>Draw {draw.toFixed(0)}%</span>
        <span>Loss {los.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function scoreColor(cp?: number, mate?: number): string {
  const v = mate ?? (cp ?? 0) / 100;
  if (v > 0.5) return '#81b64c';
  if (v < -0.5) return '#d64545';
  return '#d4d4d4';
}

function fmt(n?: number): string {
  if (!n) return '—';
  if (n > 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n > 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
}
