import type { PositionAnalysis, PvLine } from '../types';
import { Stockfish, pickFlavor, type EngineFlavor } from './stockfish';
import { parseInfo, parseBestmove, mergePvLine, toWhitePov } from './uci';

export interface AnalyzeOptions {
  depth: number;
  multiPv: number;
  threads?: number;
  hashMb?: number;
  /** Per-position wall-clock cap; search stops at depth or timeout, whichever first. */
  movetimeMs?: number;
}

export interface AnalyzeHandle {
  promise: Promise<PositionAnalysis>;
  cancel: () => void;
}

interface Job {
  fen: string;
  opts: AnalyzeOptions;
  onUpdate?: (a: PositionAnalysis) => void;
  resolve: (a: PositionAnalysis) => void;
  cancelled: boolean;
}

function sideToMove(fen: string): 'w' | 'b' {
  return (fen.split(' ')[1] as 'w' | 'b') ?? 'w';
}

/**
 * Serialises engine work behind a single Stockfish worker. Only one `go`
 * runs at a time; new jobs queue. Navigating mid-analysis cancels in-flight
 * jobs so the UI stays responsive.
 */
export class Orchestrator {
  private sf: Stockfish;
  private queue: Job[] = [];
  private active: Job | null = null;
  private offLine: () => void;
  readonly flavor: EngineFlavor;

  // running accumulator for the active job
  private lines: PvLine[] = [];
  private depth = 0;
  private nodes = 0;
  private nps = 0;
  private bestUci?: string;

  constructor(flavor: EngineFlavor = pickFlavor()) {
    this.sf = new Stockfish(flavor);
    this.flavor = this.sf.flavor;
    this.offLine = this.sf.onLine((line) => this.onLine(line));
  }

  whenReady() {
    return this.sf.whenReady();
  }

  private onLine(line: string) {
    if (!this.active) return;
    const stm = sideToMove(this.active.fen);

    const best = parseBestmove(line);
    if (best !== undefined || line.startsWith('bestmove')) {
      this.bestUci = best ?? this.lines[0]?.uci[0];
      this.finishActive(true);
      return;
    }

    const info = parseInfo(line);
    if (!info) return;
    if (info.depth != null) this.depth = info.depth;
    if (info.nodes != null) this.nodes = info.nodes;
    if (info.nps != null) this.nps = info.nps;
    if (info.score) {
      // convert to White POV before storing
      const wp = toWhitePov(info.score, stm);
      this.lines = mergePvLine(this.lines, { ...info, score: wp });
    }
    if (info.multipv === 1 && this.lines.length) {
      this.bestUci = this.lines[0]?.uci[0];
      this.active.onUpdate?.(this.snapshot(false));
    }
  }

  private snapshot(complete: boolean): PositionAnalysis {
    return {
      fen: this.active!.fen,
      depth: this.depth,
      nodes: this.nodes,
      nps: this.nps,
      lines: this.lines.slice(),
      bestUci: this.bestUci,
      complete,
    };
  }

  private finishActive(complete: boolean) {
    const job = this.active;
    if (!job) return;
    const result = this.snapshot(complete && !job.cancelled);
    this.active = null;
    job.resolve(result);
    this.runNext();
  }

  private runNext() {
    if (this.active || this.queue.length === 0) return;
    // Skip cancelled jobs (already resolved).
    let job = this.queue.shift();
    while (job && job.cancelled) job = this.queue.shift();
    if (!job) return;

    this.active = job;
    this.lines = [];
    this.depth = 0;
    this.nodes = 0;
    this.nps = 0;
    this.bestUci = undefined;

    this.sf.configure({
      multiPv: job.opts.multiPv,
      threads: job.opts.threads,
      hashMb: job.opts.hashMb,
    });
    this.sf.send(`position fen ${job.fen}`);
    const mt = job.opts.movetimeMs;
    this.sf.send(mt ? `go depth ${job.opts.depth} movetime ${mt}` : `go depth ${job.opts.depth}`);
  }

  analyze(
    fen: string,
    opts: AnalyzeOptions,
    onUpdate?: (a: PositionAnalysis) => void
  ): AnalyzeHandle {
    let job!: Job;
    const promise = new Promise<PositionAnalysis>((resolve) => {
      job = { fen, opts, onUpdate, resolve, cancelled: false };
    });
    this.queue.push(job);
    this.runNext();
    return {
      promise,
      cancel: () => {
        job.cancelled = true;
        if (this.active === job) this.sf.stop(); // engine will emit bestmove
      },
    };
  }

  /** Cancel every queued/active job (e.g. user navigated away). */
  cancelAll() {
    for (const j of this.queue) j.cancelled = true;
    if (this.active) {
      this.active.cancelled = true;
      this.sf.stop();
    }
  }

  terminate() {
    this.offLine();
    this.sf.terminate();
  }
}
