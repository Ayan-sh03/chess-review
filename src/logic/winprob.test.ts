import { describe, it, expect } from 'vitest';
import { winPctFromCp, winPctWhite, formatScore, scoreToCp } from './winprob';

describe('win probability', () => {
  it('is 50% at equality', () => {
    expect(winPctFromCp(0)).toBeCloseTo(50, 5);
  });
  it('is symmetric around 0', () => {
    expect(winPctFromCp(150) + winPctFromCp(-150)).toBeCloseTo(100, 5);
  });
  it('rises with advantage', () => {
    expect(winPctFromCp(300)).toBeGreaterThan(winPctFromCp(100));
  });
  it('treats mate as near-certain', () => {
    expect(winPctWhite({ mate: 3 })).toBeGreaterThan(99);
    expect(winPctWhite({ mate: -3 })).toBeLessThan(1);
  });
});

describe('score formatting', () => {
  it('formats centipawns', () => {
    expect(formatScore({ cp: 120 })).toBe('+1.20');
    expect(formatScore({ cp: -50 })).toBe('-0.50');
  });
  it('formats mate', () => {
    expect(formatScore({ mate: 3 })).toBe('M3');
    expect(formatScore({ mate: -2 })).toBe('-M2');
  });
  it('ranks nearer mates higher', () => {
    expect(scoreToCp({ mate: 1 })).toBeGreaterThan(scoreToCp({ mate: 5 }));
  });
});
