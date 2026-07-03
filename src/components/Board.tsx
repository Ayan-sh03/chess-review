import { useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { useStore, selectCurrentFen, fenAtPly } from '../store';
import { useElementWidth } from '../ui/hooks';
import { ClassBadge } from '../ui/common';
import type { Classification } from '../types';

type Square = string;

function squareToXY(sq: Square, orientation: 'white' | 'black', size: number) {
  const file = sq.charCodeAt(0) - 97; // a=0
  const rank = parseInt(sq[1], 10); // 1..8
  const s = size / 8;
  const x = orientation === 'white' ? file * s : (7 - file) * s;
  const y = orientation === 'white' ? (8 - rank) * s : (rank - 1) * s;
  return { x, y, s };
}

export default function Board() {
  const {
    games, selectedGameIndex, currentPly, orientation, settings,
    liveAnalysis, review, variation, playVariationMove, enterVariation,
  } = useStore();
  const fen = useStore(selectCurrentFen);
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const game = games[selectedGameIndex];

  const playedMove = !variation && currentPly > 0 && game ? game.plies[currentPly - 1] : null;
  const playedClass: Classification | undefined =
    !variation && currentPly > 0 ? review?.moves[currentPly - 1]?.classification : undefined;

  // Best move comes from the live engine (only if it analyzed this exact
  // position — stale results must never draw on the board), else from the
  // review of this position.
  const live = liveAnalysis && liveAnalysis.fen === fen ? liveAnalysis : null;
  const bestUci =
    live?.bestUci ??
    (!variation && game ? review?.moves[currentPly]?.bestUci : undefined);

  const arrows = useMemo(() => {
    if (!settings.showArrows) return [] as any[];
    const out: [string, string, string?][] = [];
    if (playedMove) {
      out.push([playedMove.uci.slice(0, 2), playedMove.uci.slice(2, 4), '#f5a623']);
    }
    if (bestUci && bestUci.slice(0, 4) !== playedMove?.uci.slice(0, 4)) {
      out.push([bestUci.slice(0, 2), bestUci.slice(2, 4), '#22a7f0']);
    }
    return out;
  }, [bestUci, playedMove, settings.showArrows]);

  const squareStyles = useMemo(() => {
    const st: Record<string, React.CSSProperties> = {};
    if (playedMove) {
      st[playedMove.uci.slice(0, 2)] = { background: 'rgba(255,213,79,0.35)' };
      st[playedMove.uci.slice(2, 4)] = { background: 'rgba(255,213,79,0.45)' };
    }
    return st;
  }, [playedMove]);

  function onDrop(source: string, target: string, piece: string): boolean {
    let uci = source + target;
    const isPawn = piece?.[1]?.toLowerCase() === 'p';
    const lastRank = target[1] === '8' || target[1] === '1';
    if (isPawn && lastRank) uci += 'q';
    if (!variation) enterVariation();
    // enterVariation is async-ish via set; play after a tick is unnecessary as
    // store updates synchronously.
    playVariationMove(uci);
    return true;
  }

  const badge =
    playedMove && playedClass
      ? squareToXY(playedMove.uci.slice(2, 4) as Square, orientation, width)
      : null;

  return (
    <div ref={ref} className="relative w-full">
      <Chessboard
        position={fen || fenAtPly(game ?? ({ startFen: 'start', plies: [] } as any), 0)}
        boardOrientation={orientation}
        boardWidth={width}
        customArrows={arrows as any}
        customSquareStyles={squareStyles}
        customDarkSquareStyle={{ backgroundColor: settings.boardDark }}
        customLightSquareStyle={{ backgroundColor: settings.boardLight }}
        arePiecesDraggable={true}
        onPieceDrop={onDrop}
        animationDuration={150}
      />
      {badge && playedClass && (
        <div
          className="pointer-events-none absolute"
          style={{ left: badge.x + badge.s * 0.62, top: badge.y + badge.s * 0.04 }}
        >
          <ClassBadge cls={playedClass} size={Math.max(16, badge.s * 0.42)} />
        </div>
      )}
    </div>
  );
}
