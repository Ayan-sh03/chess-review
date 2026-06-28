import { useRef, useState } from 'react';
import { useStore } from '../store';
import { Section } from '../ui/common';

const SAMPLE_PGN = `[Event "Paris Opera"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

export default function InputPanel() {
  const {
    loadPgn, loadFen, inputError, games, selectedGameIndex, selectGame,
    startReview, status, importing,
    importLichessUser, importLichessGame, importChessComUser, importChessComGame,
  } = useStore();
  const [pgn, setPgn] = useState('');
  const [fen, setFen] = useState('');
  const [imp, setImp] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(file: File) {
    file.text().then((t) => { setPgn(t); loadPgn(t); });
  }

  return (
    <div className="space-y-3">
      <Section title="Paste PGN">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          className={`rounded border-2 border-dashed p-1 transition ${dragOver ? 'border-emerald-500 bg-emerald-500/5' : 'border-neutral-700'}`}
        >
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="Paste PGN, or drag & drop a .pgn file here…"
            rows={5}
            className="w-full resize-y rounded bg-neutral-950 p-2 font-mono text-xs text-neutral-200 outline-none placeholder:text-neutral-600"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Btn primary onClick={() => loadPgn(pgn)} disabled={!pgn.trim()}>Load PGN</Btn>
          <Btn onClick={() => fileRef.current?.click()}>Choose file…</Btn>
          <Btn onClick={() => { setPgn(SAMPLE_PGN); loadPgn(SAMPLE_PGN); }}>Load sample</Btn>
          <input
            ref={fileRef} type="file" accept=".pgn,.txt" className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>
      </Section>

      <Section title="Load a single position (FEN)">
        <div className="flex gap-2">
          <input
            value={fen} onChange={(e) => setFen(e.target.value)}
            placeholder="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b …"
            className="min-w-0 flex-1 rounded bg-neutral-950 px-2 py-1.5 font-mono text-xs text-neutral-200 outline-none placeholder:text-neutral-600"
          />
          <Btn onClick={() => loadFen(fen)} disabled={!fen.trim()}>Load</Btn>
        </div>
      </Section>

      <Section title="Import from Lichess / Chess.com">
        <input
          value={imp} onChange={(e) => setImp(e.target.value)}
          placeholder="username, or a lichess game id / URL"
          className="mb-2 w-full rounded bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200 outline-none placeholder:text-neutral-600"
        />
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => importLichessUser(imp)} disabled={importing || !imp.trim()}>Lichess user</Btn>
          <Btn onClick={() => importLichessGame(imp)} disabled={importing || !imp.trim()}>Lichess game</Btn>
          <Btn onClick={() => importChessComUser(imp)} disabled={importing || !imp.trim()}>Chess.com user</Btn>
          <Btn onClick={() => importChessComGame(imp)} disabled={importing || !imp.trim()}>Chess.com URL</Btn>
        </div>
        {importing && <p className="mt-1 text-xs text-emerald-400">Fetching…</p>}
      </Section>

      {games.length > 1 && (
        <Section title="Game selector">
          <select
            value={selectedGameIndex}
            onChange={(e) => selectGame(+e.target.value)}
            className="w-full rounded bg-neutral-950 px-2 py-1.5 text-sm text-neutral-200 outline-none"
          >
            {games.map((g, i) => (
              <option key={i} value={i}>
                {i + 1}. {g.tags.White ?? '?'} vs {g.tags.Black ?? '?'} {g.tags.Result ? `(${g.tags.Result})` : ''}
              </option>
            ))}
          </select>
        </Section>
      )}

      {inputError && (
        <div className="whitespace-pre-wrap rounded border border-red-800 bg-red-950/40 p-2 text-xs text-red-300">
          {inputError}
        </div>
      )}

      {games.length > 0 && (
        <button
          onClick={startReview}
          disabled={status === 'reviewing'}
          className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
        >
          {status === 'reviewing' ? 'Reviewing…' : '▶ Start Review'}
        </button>
      )}
    </div>
  );
}

function Btn({
  children, onClick, disabled, primary,
}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-2.5 py-1.5 text-xs font-medium ring-1 disabled:opacity-40
        ${primary
          ? 'bg-emerald-600 text-white ring-emerald-500 hover:bg-emerald-500'
          : 'bg-neutral-800 text-neutral-200 ring-neutral-700 hover:bg-neutral-700'}`}
    >
      {children}
    </button>
  );
}
