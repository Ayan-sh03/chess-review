import { describe, it, expect } from 'vitest';
import { classify, type ClassifyInput } from './classify';
import { DEFAULT_THRESHOLDS } from '../types';

function base(over: Partial<ClassifyInput>): ClassifyInput {
  return {
    scoreBefore: { cp: 20 },
    scoreAfter: { cp: 20 },
    moverColor: 'w',
    playedUci: 'e2e4',
    bestUci: 'e2e4',
    legalCount: 30,
    isBook: false,
    sacrificedMaterial: 0,
    thresholds: DEFAULT_THRESHOLDS,
    ...over,
  };
}

describe('classify', () => {
  it('flags book moves', () => {
    expect(classify(base({ isBook: true })).classification).toBe('book');
  });

  it('best when matching engine top move', () => {
    expect(classify(base({})).classification).toBe('best');
  });

  it('blunder on a large win% drop', () => {
    const r = classify(base({
      playedUci: 'a2a3', bestUci: 'e2e4',
      scoreBefore: { cp: 50 }, scoreAfter: { cp: -600 },
    }));
    expect(r.classification).toBe('blunder');
    expect(r.winPctLoss).toBeGreaterThan(DEFAULT_THRESHOLDS.mistake);
  });

  it('inaccuracy on a small drop', () => {
    const r = classify(base({
      playedUci: 'a2a3', bestUci: 'e2e4',
      scoreBefore: { cp: 30 }, scoreAfter: { cp: -60 },
    }));
    expect(['inaccuracy', 'good']).toContain(r.classification);
  });

  it('forced when only one legal move', () => {
    const r = classify(base({
      legalCount: 1, playedUci: 'g1f3', bestUci: 'e2e4',
      scoreBefore: { cp: 50 }, scoreAfter: { cp: -300 },
    }));
    expect(r.classification).toBe('forced');
  });

  it('missed win when surrendering a winning position', () => {
    const r = classify(base({
      playedUci: 'a2a3', bestUci: 'd1h5',
      scoreBefore: { cp: 900 }, scoreAfter: { cp: 20 },
      legalCount: 25,
    }));
    expect(r.classification).toBe('missed');
  });

  it('brilliant on a sound sacrifice that keeps the edge', () => {
    const r = classify(base({
      playedUci: 'c4f7', bestUci: 'c4f7',
      scoreBefore: { cp: 60 }, scoreAfter: { cp: 80 },
      sacrificedMaterial: 3, legalCount: 28,
    }));
    expect(r.classification).toBe('brilliant');
  });
});
