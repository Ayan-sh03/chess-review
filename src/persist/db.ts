import type { PositionAnalysis, ReviewedGame, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const DB_NAME = 'chess-review';
const DB_VERSION = 1;
const CACHE_STORE = 'analysisCache';
const GAMES_STORE = 'games';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE))
        db.createObjectStore(CACHE_STORE);
      if (!db.objectStoreNames.contains(GAMES_STORE))
        db.createObjectStore(GAMES_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

const cacheKey = (fen: string, depth: number) => `${fen}@${depth}`;

export async function getCachedAnalysis(
  fen: string,
  depth: number
): Promise<PositionAnalysis | undefined> {
  try {
    return await tx<PositionAnalysis>(CACHE_STORE, 'readonly', (s) =>
      s.get(cacheKey(fen, depth))
    );
  } catch {
    return undefined;
  }
}

export async function putCachedAnalysis(a: PositionAnalysis): Promise<void> {
  try {
    await tx(CACHE_STORE, 'readwrite', (s) =>
      s.put(a, cacheKey(a.fen, a.depth))
    );
  } catch {
    /* cache is best-effort */
  }
}

export async function saveGame(game: ReviewedGame): Promise<void> {
  await tx(GAMES_STORE, 'readwrite', (s) => s.put(game));
}

export async function listGames(): Promise<ReviewedGame[]> {
  try {
    const all = await tx<ReviewedGame[]>(GAMES_STORE, 'readonly', (s) =>
      s.getAll()
    );
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function deleteGame(id: string): Promise<void> {
  await tx(GAMES_STORE, 'readwrite', (s) => s.delete(id));
}

// --------------------------- settings (localStorage) -----------------------

const SETTINGS_KEY = 'chess-review-settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    // Deep-merge so new defaults survive older saved settings.
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      engine: { ...DEFAULT_SETTINGS.engine, ...parsed.engine },
      thresholds: { ...DEFAULT_SETTINGS.thresholds, ...parsed.thresholds },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota errors */
  }
}
