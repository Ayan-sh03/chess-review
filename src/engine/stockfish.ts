// ---------------------------------------------------------------------------
// Low-level Stockfish 16 NNUE wrapper.
//
// The stockfish.js builds are *themselves* web workers: we `new Worker(url)`
// and exchange UCI strings via postMessage. This module picks the best build
// the current browser can run and exposes a tiny line-oriented API.
// ---------------------------------------------------------------------------

export type EngineFlavor = 'threaded' | 'single' | 'no-simd';

const BUILDS: Record<EngineFlavor, string> = {
  threaded: '/stockfish/stockfish-nnue-16.js',
  single: '/stockfish/stockfish-nnue-16-single.js',
  'no-simd': '/stockfish/stockfish-nnue-16-no-simd.js',
};

/** Detect WASM SIMD support by trying to compile a module that uses it. */
function hasWasmSimd(): boolean {
  try {
    // Minimal module with a v128.const instruction.
    const bytes = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1,
      8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]);
    return WebAssembly.validate(bytes);
  } catch {
    return false;
  }
}

export function canUseThreads(): boolean {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof self !== 'undefined' &&
    (self as any).crossOriginIsolated === true
  );
}

export function pickFlavor(): EngineFlavor {
  if (!hasWasmSimd()) return 'no-simd';
  if (canUseThreads()) return 'threaded';
  return 'single';
}

export type LineHandler = (line: string) => void;

export class Stockfish {
  readonly flavor: EngineFlavor;
  private worker: Worker;
  private handlers = new Set<LineHandler>();
  private ready: Promise<void>;

  constructor(flavor: EngineFlavor = pickFlavor()) {
    this.flavor = flavor;
    this.worker = new Worker(BUILDS[flavor]);
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : (e.data?.data ?? '');
      if (line) for (const h of this.handlers) h(line);
    };
    this.ready = this.handshake();
  }

  private handshake(): Promise<void> {
    return new Promise((resolve) => {
      const onLine = (line: string) => {
        if (line.includes('uciok') || line.includes('readyok')) {
          this.handlers.delete(onLine);
          resolve();
        }
      };
      this.handlers.add(onLine);
      this.send('uci');
      this.send('isready');
    });
  }

  onLine(h: LineHandler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  send(cmd: string): void {
    this.worker.postMessage(cmd);
  }

  async whenReady(): Promise<void> {
    return this.ready;
  }

  /** Wait for a `readyok` round-trip — used to serialise commands. */
  sync(): Promise<void> {
    return new Promise((resolve) => {
      const off = this.onLine((line) => {
        if (line.includes('readyok')) {
          off();
          resolve();
        }
      });
      this.send('isready');
    });
  }

  configure(opts: { multiPv?: number; threads?: number; hashMb?: number }): void {
    if (opts.multiPv != null) this.send(`setoption name MultiPV value ${opts.multiPv}`);
    if (this.flavor === 'threaded' && opts.threads != null)
      this.send(`setoption name Threads value ${Math.max(1, opts.threads)}`);
    if (opts.hashMb != null) this.send(`setoption name Hash value ${opts.hashMb}`);
  }

  stop(): void {
    this.send('stop');
  }

  terminate(): void {
    try {
      this.send('quit');
    } catch {
      /* ignore */
    }
    this.worker.terminate();
    this.handlers.clear();
  }
}
