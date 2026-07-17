// ---------------------------------------------------------------------------
// EnginePool — several Stockfish workers analysing *different* positions in
// parallel. WASM SMP scales poorly past a few threads, but independent
// positions scale near-linearly across workers, so a game review dispatches
// each position to the least-loaded worker instead of queueing everything
// behind one engine.
// ---------------------------------------------------------------------------

import { Orchestrator, type AnalyzeHandle, type AnalyzeOptions } from './orchestrator';
import { canUseThreads } from './stockfish';

/** Threads each pool worker runs with (2 is the SMP sweet spot for WASM). */
export function poolThreadsPerWorker(): number {
  return canUseThreads() ? 2 : 1;
}

/** Auto pool size: saturate the machine (workers × threads ≈ cores). */
export function defaultPoolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  return Math.max(1, Math.min(8, Math.floor(cores / poolThreadsPerWorker())));
}

export class EnginePool {
  readonly size: number;
  private workers: { orch: Orchestrator; load: number }[];
  private hashMb: number;
  private threadsPerWorker: number;

  constructor(size = defaultPoolSize(), hashMb = 32) {
    this.size = Math.max(1, size);
    this.hashMb = hashMb;
    this.threadsPerWorker = poolThreadsPerWorker();
    this.workers = Array.from({ length: this.size }, () => ({
      orch: new Orchestrator(),
      load: 0,
    }));
  }

  whenReady(): Promise<void> {
    return Promise.all(this.workers.map((w) => w.orch.whenReady())).then(() => {});
  }

  /** Dispatch to the least-loaded worker. Callers should keep in-flight jobs ≤ size. */
  analyze(fen: string, opts: AnalyzeOptions): AnalyzeHandle {
    let target = this.workers[0];
    for (const w of this.workers) if (w.load < target.load) target = w;
    target.load++;
    const handle = target.orch.analyze(fen, {
      ...opts,
      threads: this.threadsPerWorker,
      hashMb: this.hashMb,
    });
    void handle.promise.finally(() => {
      target.load--;
    });
    return handle;
  }

  cancelAll(): void {
    for (const w of this.workers) w.orch.cancelAll();
  }

  terminate(): void {
    for (const w of this.workers) w.orch.terminate();
    this.workers = [];
  }
}
