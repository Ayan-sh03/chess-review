import { useState } from 'react';
import Board from './components/Board';
import EvalBar from './components/EvalBar';
import NavControls from './components/NavControls';
import EvalGraph from './components/EvalGraph';
import MoveList from './components/MoveList';
import ReviewPanel from './components/ReviewPanel';
import CoachPanel from './components/CoachPanel';
import EnginePanel from './components/EnginePanel';
import InputPanel from './components/InputPanel';
import SettingsPanel from './components/SettingsPanel';
import SavedGames from './components/SavedGames';
import VariationBar from './components/VariationBar';
import { useKeyboardNav, useAutoplay } from './ui/hooks';
import { useStore } from './store';

type Tab = 'review' | 'coach' | 'moves' | 'engine' | 'input' | 'settings' | 'saved';

const TABS: { id: Tab; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'coach', label: 'Coach' },
  { id: 'moves', label: 'Moves' },
  { id: 'engine', label: 'Engine' },
  { id: 'input', label: 'Input' },
  { id: 'saved', label: 'Saved' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  useKeyboardNav();
  useAutoplay();
  const games = useStore((s) => s.games);
  const [tab, setTab] = useState<Tab>(games.length ? 'review' : 'input');

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-4 p-3 md:p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">
          ♟ Chess Game Review
          <span className="ml-2 text-xs font-normal text-neutral-500">local · Stockfish 16 NNUE</span>
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Left: board column */}
        <div className="flex flex-col gap-3">
          <VariationBar />
          <div className="flex gap-3">
            <div className="h-[min(72vw,560px)] shrink-0 self-stretch">
              <EvalBar />
            </div>
            <div className="min-w-0 flex-1">
              <Board />
            </div>
          </div>
          <NavControls />
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-2">
            <EvalGraph />
          </div>
        </div>

        {/* Right: tabbed panels */}
        <div className="flex flex-col gap-3">
          <div className="scroll-thin flex gap-1 overflow-x-auto rounded-lg bg-neutral-900 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                  tab === t.id ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="scroll-thin max-h-[78vh] overflow-y-auto pr-1">
            {tab === 'review' && <ReviewPanel />}
            {tab === 'coach' && <CoachPanel />}
            {tab === 'moves' && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/60">
                <MoveList />
              </div>
            )}
            {tab === 'engine' && <EnginePanel />}
            {tab === 'input' && <InputPanel />}
            {tab === 'saved' && <SavedGames />}
            {tab === 'settings' && <SettingsPanel />}
          </div>
        </div>
      </div>

      <footer className="mt-2 text-center text-[11px] text-neutral-600">
        100% client-side. Engine runs on your CPU. Evaluations vary with depth & hardware —
        pin depth/nodes in Settings for reproducible reports.
      </footer>
    </div>
  );
}
