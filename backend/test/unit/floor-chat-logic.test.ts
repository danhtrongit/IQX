import { describe, expect, it } from 'vitest';

import {
  CHAT_RULES,
  IMAGE_RULES,
  SACO_ICONS,
  canRecall,
  imageWindow,
  cleanField,
  cleanSacoName,
  cleanText,
  guestLabel,
  invitePreview,
  moveInOrder,
  pickFallbackSaco,
  pickSacoIcon,
  type DispatchCandidate,
  type OrderEntry,
} from '../../src/modules/trading-floor/floor-chat.logic.js';

describe('cleanText', () => {
  it('normalises, trims and caps blank runs', () => {
    expect(cleanText('  xin chào  ')).toBe('xin chào');
    expect(cleanText('a\r\nb')).toBe('a\nb');
    expect(cleanText('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('drops control characters but keeps newlines', () => {
    expect(cleanText('a\u0000b\u0007c\nd')).toBe('abc\nd');
  });

  it('rejects empty, non-string and over-long text', () => {
    expect(cleanText('   \n  ')).toBeNull();
    expect(cleanText(42)).toBeNull();
    expect(cleanText('x'.repeat(CHAT_RULES.maxText))).not.toBeNull();
    expect(cleanText('x'.repeat(CHAT_RULES.maxText + 1))).toBeNull();
  });
});

describe('cleanField / cleanSacoName', () => {
  it('strips markup characters and collapses whitespace', () => {
    expect(cleanField('  <b>Sư   Tử</b> ', 40)).toBe('bSư Tử/b');
    expect(cleanField(7, 10)).toBe('');
    expect(cleanField('abcdef', 3)).toBe('abc');
  });

  it('needs at least two characters', () => {
    expect(cleanSacoName('A')).toBeNull();
    expect(cleanSacoName(' An ')).toBe('An');
    expect(cleanSacoName('x'.repeat(60))).toHaveLength(40);
  });
});

describe('pickSacoIcon', () => {
  it('cycles through the icons', () => {
    expect(pickSacoIcon(0)).toBe(SACO_ICONS[0]);
    expect(pickSacoIcon(SACO_ICONS.length)).toBe(SACO_ICONS[0]);
    expect(pickSacoIcon(-3)).toBe(SACO_ICONS[0]);
  });
});

describe('moveInOrder', () => {
  const order: OrderEntry[] = [
    { id: 'a1', leadUserId: 'A' },
    { id: 'b1', leadUserId: 'B' },
    { id: 'a2', leadUserId: 'A' },
    { id: 'b2', leadUserId: 'B' },
    { id: 'a3', leadUserId: 'A' },
  ];

  it('lets an admin swap with the direct neighbour whatever the group', () => {
    expect(moveInOrder(order, 'a2', 'up', null)).toEqual(['a1', 'a2', 'b1', 'b2', 'a3']);
    expect(moveInOrder(order, 'a2', 'down', null)).toEqual(['a1', 'b1', 'b2', 'a2', 'a3']);
  });

  it('keeps a team lead inside the slots of their own group', () => {
    expect(moveInOrder(order, 'a2', 'up', 'A')).toEqual(['a2', 'b1', 'a1', 'b2', 'a3']);
    expect(moveInOrder(order, 'a2', 'down', 'A')).toEqual(['a1', 'b1', 'a3', 'b2', 'a2']);
  });

  it('does nothing at the ends, for other groups or for unknown ids', () => {
    const ids = order.map((entry) => entry.id);
    expect(moveInOrder(order, 'a1', 'up', null)).toEqual(ids);
    expect(moveInOrder(order, 'a3', 'down', null)).toEqual(ids);
    expect(moveInOrder(order, 'a1', 'up', 'A')).toEqual(ids);
    expect(moveInOrder(order, 'b1', 'up', 'A')).toEqual(ids);
    expect(moveInOrder(order, 'zz', 'up', null)).toEqual(ids);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(order);
    moveInOrder(order, 'a2', 'up', null);
    expect(JSON.stringify(order)).toBe(before);
  });
});

describe('guestLabel', () => {
  it('marks guests so a SACO or an admin cannot mistake them for an account', () => {
    expect(guestLabel('Minh Anh', true)).toBe('Minh Anh (khách)');
    expect(guestLabel('Minh Anh', false)).toBe('Minh Anh');
    expect(guestLabel('', true)).toBe('Khách (khách)');
  });
});

describe('invitePreview', () => {
  it('keeps short text on one line', () => {
    expect(invitePreview('  Chào SACO,\n\ncho em hỏi  ')).toBe('Chào SACO, cho em hỏi');
  });

  it('cuts long text to 120 characters including the ellipsis', () => {
    const preview = invitePreview('a'.repeat(300));
    expect(Array.from(preview)).toHaveLength(120);
    expect(preview.endsWith('…')).toBe(true);
    expect(invitePreview('b'.repeat(120))).toBe('b'.repeat(120));
  });

  it('never splits a surrogate pair', () => {
    const preview = invitePreview('𝐀'.repeat(200), 10);
    expect(Array.from(preview)).toHaveLength(10);
    expect(preview).toBe(`${'𝐀'.repeat(9)}…`);
  });
});

describe('pickFallbackSaco', () => {
  const saco = (
    id: string,
    patch: Partial<DispatchCandidate> = {},
  ): DispatchCandidate => ({
    id,
    userId: `user-${id}`,
    active: true,
    onDuty: false,
    online: false,
    ...patch,
  });

  it('picks the highest-ranked SACO with a socket, on duty or not', () => {
    const ranking = [saco('a'), saco('b', { online: true }), saco('c', { online: true, onDuty: true })];
    expect(pickFallbackSaco(ranking, 'visitor')).toBe('b');
  });

  it('falls back to the highest-ranked active SACO when nobody is connected', () => {
    expect(pickFallbackSaco([saco('a'), saco('b')], 'visitor')).toBe('a');
  });

  it('skips inactive SACOs', () => {
    const ranking = [saco('a', { active: false, online: true }), saco('b'), saco('c', { online: true })];
    expect(pickFallbackSaco(ranking, 'visitor')).toBe('c');
    expect(pickFallbackSaco([saco('a', { active: false })], 'visitor')).toBeNull();
  });

  it('never gives the conversation to the visitor themself', () => {
    const ranking = [saco('a', { online: true }), saco('b')];
    expect(pickFallbackSaco(ranking, 'user-a')).toBe('b');
    expect(pickFallbackSaco([saco('a', { online: true })], 'user-a')).toBeNull();
  });

  it('returns null when there is no SACO at all', () => {
    expect(pickFallbackSaco([], 'visitor')).toBeNull();
  });
});

describe('canRecall', () => {
  it('lets each side recall only its own messages, never a system line', () => {
    expect(canRecall('u', 'user')).toBe(true);
    expect(canRecall('s', 'user')).toBe(false);
    expect(canRecall('s', 'saco')).toBe(true);
    expect(canRecall('u', 'saco')).toBe(false);
    expect(canRecall('x', 'user')).toBe(false);
    expect(canRecall('x', 'saco')).toBe(false);
  });
});

describe('imageWindow', () => {
  it('allows up to ten images in ten minutes', () => {
    const now = 1_000_000;
    const nine = Array.from({ length: 9 }, (_, i) => now - i * 1000);
    expect(imageWindow(nine, now).allowed).toBe(true);
    const ten = [...nine, now - 30_000];
    expect(imageWindow(ten, now)).toMatchObject({ allowed: false });
  });

  it('forgets images older than the window and does not touch its input', () => {
    const now = 5_000_000;
    const times = [now - IMAGE_RULES.windowMs, now - IMAGE_RULES.windowMs + 1, now];
    const result = imageWindow(times, now);
    expect(result.kept).toEqual([now - IMAGE_RULES.windowMs + 1, now]);
    expect(times).toHaveLength(3);
  });
});
