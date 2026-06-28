import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

/** Measure an element's width (for sizing the board and overlays). */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(480);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Global keyboard navigation (arrows / home / end / space). */
export function useKeyboardNav() {
  const { next, prev, toStart, toEnd, setAutoplay, autoplay } = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); next(); break;
        case 'ArrowLeft': e.preventDefault(); prev(); break;
        case 'ArrowUp': case 'Home': e.preventDefault(); toStart(); break;
        case 'ArrowDown': case 'End': e.preventDefault(); toEnd(); break;
        case ' ': e.preventDefault(); setAutoplay(!autoplay); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, toStart, toEnd, setAutoplay, autoplay]);
}

/** Drive autoplay forward at the configured speed. */
export function useAutoplay() {
  const { autoplay, next, currentPly, games, selectedGameIndex, setAutoplay, settings } =
    useStore();
  useEffect(() => {
    if (!autoplay) return;
    const game = games[selectedGameIndex];
    if (!game) return;
    if (currentPly >= game.plies.length) {
      setAutoplay(false);
      return;
    }
    const id = setTimeout(next, settings.autoplayMs);
    return () => clearTimeout(id);
  }, [autoplay, currentPly, next, games, selectedGameIndex, setAutoplay, settings.autoplayMs]);
}
