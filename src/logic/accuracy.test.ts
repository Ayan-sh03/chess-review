import { describe, it, expect } from 'vitest';
import { accuracyFromWinLoss, accuracyFromAcpl, phaseOf } from './accuracy';

describe('accuracy', () => {
  it('is ~100 for a perfect move', () => {
    expect(accuracyFromWinLoss(0)).toBeGreaterThan(99);
  });
  it('drops as win% loss grows', () => {
    expect(accuracyFromWinLoss(30)).toBeLessThan(accuracyFromWinLoss(5));
  });
  it('acpl model is 100 at zero loss and decays', () => {
    expect(accuracyFromAcpl(0)).toBeCloseTo(100, 5);
    expect(accuracyFromAcpl(200)).toBeLessThan(accuracyFromAcpl(50));
  });
});

describe('phase detection', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  it('calls the opening the opening', () => {
    expect(phaseOf(start, 3)).toBe('opening');
  });
  it('detects an endgame by low material', () => {
    const kpk = '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1';
    expect(phaseOf(kpk, 40)).toBe('endgame');
  });
});
