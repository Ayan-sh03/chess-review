import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useStore } from '../store';
import { CLASSIFICATION_META } from '../types';
import { formatScore } from '../logic/winprob';

const MARK = new Set(['brilliant', 'great', 'blunder', 'mistake', 'missed']);

export default function EvalGraph() {
  const { review, currentPly, goTo } = useStore();
  if (!review || review.moves.length === 0)
    return (
      <div className="flex h-32 items-center justify-center text-xs text-neutral-600">
        Run a review to see the evaluation graph.
      </div>
    );

  const data = [
    { ply: 0, evl: review.moves[0]?.evalBefore ?? 0, cls: null, san: '' },
    ...review.moves.map((m) => ({
      ply: m.ply,
      evl: m.evalAfter,
      cls: m.classification,
      san: m.playedMove,
    })),
  ];

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 6, right: 6, bottom: 0, left: -28 }}
          onClick={(s: any) => {
            if (s && s.activeLabel != null) goTo(Number(s.activeLabel));
          }}
        >
          <defs>
            <linearGradient id="evalUp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fafafa" stopOpacity={0.9} />
              <stop offset="50%" stopColor="#9ca3af" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#171717" stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <XAxis dataKey="ply" hide />
          <YAxis domain={[-8, 8]} tick={{ fontSize: 10, fill: '#737373' }} width={32} />
          <ReferenceLine y={0} stroke="#525252" strokeDasharray="3 3" />
          <ReferenceLine x={currentPly} stroke="#10b981" />
          <Tooltip
            contentStyle={{ background: '#171717', border: '1px solid #404040', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(l) => `Ply ${l}`}
            formatter={(v: any) => [`${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}`, 'Eval']}
          />
          <Area type="monotone" dataKey="evl" stroke="#e5e5e5" strokeWidth={1.5} fill="url(#evalUp)" />
          {data.map((d) =>
            d.cls && MARK.has(d.cls) ? (
              <ReferenceDot
                key={d.ply}
                x={d.ply}
                y={d.evl}
                r={3.5}
                fill={CLASSIFICATION_META[d.cls].color}
                stroke="#0a0a0a"
                strokeWidth={1}
              />
            ) : null
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
