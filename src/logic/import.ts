// ---------------------------------------------------------------------------
// Optional client-side imports from public Lichess / Chess.com APIs.
// Everything runs in the browser; no backend, no auth required for public data.
// ---------------------------------------------------------------------------

export class ImportError extends Error {}

const LICHESS_PGN = 'application/x-chess-pgn';

/** Pull a single Lichess game's PGN by id or full URL. */
export async function fetchLichessGame(idOrUrl: string): Promise<string> {
  const id = extractLichessId(idOrUrl);
  if (!id) throw new ImportError('Could not find a Lichess game id.');
  const res = await fetch(`https://lichess.org/game/export/${id}?clocks=false&evals=false`, {
    headers: { Accept: LICHESS_PGN },
  });
  if (!res.ok) throw new ImportError(`Lichess returned ${res.status}.`);
  return res.text();
}

/** Pull the most recent `max` games for a Lichess user as one PGN blob. */
export async function fetchLichessUser(username: string, max = 10): Promise<string> {
  const u = username.trim().replace(/^@/, '');
  if (!u) throw new ImportError('Enter a Lichess username.');
  const res = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(u)}?max=${max}&clocks=false&evals=false&opening=true`,
    { headers: { Accept: LICHESS_PGN } }
  );
  if (!res.ok) throw new ImportError(`Lichess returned ${res.status} for "${u}".`);
  const pgn = await res.text();
  if (!pgn.trim()) throw new ImportError(`No games found for "${u}".`);
  return pgn;
}

/** Pull a Chess.com user's most recent games (latest monthly archive). */
export async function fetchChessComUser(username: string, max = 10): Promise<string> {
  const u = username.trim().replace(/^@/, '');
  if (!u) throw new ImportError('Enter a Chess.com username.');
  const list = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`);
  if (!list.ok) throw new ImportError(`Chess.com returned ${list.status} for "${u}".`);
  const { archives } = (await list.json()) as { archives: string[] };
  if (!archives?.length) throw new ImportError(`No games found for "${u}".`);

  const pgns: string[] = [];
  // Walk archives newest-first until we have `max` games.
  for (let i = archives.length - 1; i >= 0 && pgns.length < max; i--) {
    const res = await fetch(archives[i]);
    if (!res.ok) continue;
    const data = (await res.json()) as { games: { pgn?: string }[] };
    const games = (data.games ?? []).filter((g) => g.pgn);
    for (let j = games.length - 1; j >= 0 && pgns.length < max; j--) {
      pgns.push(games[j].pgn as string);
    }
  }
  if (!pgns.length) throw new ImportError(`No PGN games found for "${u}".`);
  return pgns.join('\n\n');
}

/** Best-effort single Chess.com game fetch from a game URL. */
export async function fetchChessComGame(url: string): Promise<string> {
  // Chess.com has no public single-game-by-id PGN endpoint; we derive the
  // username if present, otherwise ask the user to use the username import.
  const m = url.match(/chess\.com\/(?:member|game\/live|game\/daily)\/([\w-]+)/i);
  if (m && /[a-z]/i.test(m[1]) && !/^\d+$/.test(m[1])) {
    return fetchChessComUser(m[1]);
  }
  throw new ImportError(
    'Chess.com single-game import is not supported by their public API. Use the username import instead.'
  );
}

function extractLichessId(input: string): string | null {
  const s = input.trim();
  const urlMatch = s.match(/lichess\.org\/([\w]{8})/);
  if (urlMatch) return urlMatch[1];
  if (/^[\w]{8}$/.test(s)) return s;
  // Full 12-char game+player id → first 8 is the game id.
  if (/^[\w]{12}$/.test(s)) return s.slice(0, 8);
  return null;
}
