import { describe, expect, it } from 'vitest';

import {
  FLOOR_EMOTE_MAX,
  FLOOR_STATE_MIN_MS,
  FLOOR_WORLD_MAX,
  cleanAvatar,
  cleanEmote,
  cleanName,
  cleanOutfitColor,
  cleanState,
  stateGate,
  suggestName,
} from '../../src/modules/trading-floor/floor-profile.logic.js';
import { FLOOR_AVATARS } from '../../src/modules/trading-floor/floor-types.js';

describe('cleanName', () => {
  it('needs 2 to 20 characters after cleaning', () => {
    expect(cleanName('A')).toBeNull();
    expect(cleanName('  Hà   Nội ')).toBe('Hà Nội');
    expect(cleanName('x'.repeat(40))).toHaveLength(20);
    expect(cleanName(12)).toBeNull();
  });

  it('removes markup and control characters', () => {
    expect(cleanName('<i>An</i>')).toBe('iAn/i');
    expect(cleanName('Bình\u0000An')).toBe('BìnhAn');
  });
});

describe('suggestName', () => {
  it('falls back from full name to username to Khách', () => {
    expect(suggestName('Nguyễn Văn An', 'an')).toBe('Nguyễn Văn An');
    expect(suggestName(null, 'an_user')).toBe('an_user');
    expect(suggestName('', 'a')).toBe('Khách');
  });
});

describe('cleanAvatar / cleanOutfitColor', () => {
  it('only accepts known avatars and falls back to the default colour', () => {
    expect(cleanAvatar(FLOOR_AVATARS[0])).toBe(FLOOR_AVATARS[0]);
    expect(cleanAvatar('nope')).toBeNull();
    expect(cleanOutfitColor('nope')).toBe('default');
    expect(cleanOutfitColor(undefined)).toBe('default');
  });
});

describe('cleanState', () => {
  it('rounds to 0.1 and clamps into the world', () => {
    expect(cleanState({ x: 10.04, y: 20.06, facing: 's', moving: true })).toEqual({
      x: 10,
      y: 20.1,
      facing: 's',
      moving: true,
    });
    expect(cleanState({ x: -5, y: FLOOR_WORLD_MAX + 50, facing: 'w', moving: false })).toEqual({
      x: 0,
      y: FLOOR_WORLD_MAX,
      facing: 'w',
      moving: false,
    });
  });

  it('rejects malformed states', () => {
    expect(cleanState(null)).toBeNull();
    expect(cleanState({ x: 'a', y: 1, facing: 's' })).toBeNull();
    expect(cleanState({ x: 1, y: 1, facing: 'sideways' })).toBeNull();
    expect(cleanState({ x: Number.NaN, y: 1, facing: 's' })).toBeNull();
  });
});

describe('cleanEmote', () => {
  it('trims, caps the length and drops empties', () => {
    expect(cleanEmote('  ok  ')).toBe('ok');
    expect(cleanEmote('x'.repeat(200))).toHaveLength(FLOOR_EMOTE_MAX);
    expect(cleanEmote('  <> ')).toBeNull();
    expect(cleanEmote(5)).toBeNull();
  });
});

describe('stateGate', () => {
  const still = { moving: false, facing: 's' } as const;
  const walking = { moving: true, facing: 's' } as const;

  it('always lets a start, stop or turn through, marked reliable', () => {
    expect(stateGate(still, walking, 1000, 1001)).toEqual({ allow: true, reliable: true });
    expect(stateGate(walking, still, 1000, 1001)).toEqual({ allow: true, reliable: true });
    expect(stateGate(walking, { moving: true, facing: 'w' }, 1000, 1001)).toEqual({
      allow: true,
      reliable: true,
    });
  });

  it('throttles plain position updates to one per 50 ms', () => {
    expect(stateGate(walking, walking, 1000, 1000 + FLOOR_STATE_MIN_MS - 1).allow).toBe(false);
    expect(stateGate(walking, walking, 1000, 1000 + FLOOR_STATE_MIN_MS)).toEqual({
      allow: true,
      reliable: false,
    });
  });
});
