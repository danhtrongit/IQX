import { describe, expect, it } from 'vitest';

import {
  CHAT_RULES,
  SACO_ICONS,
  cleanField,
  cleanSacoName,
  cleanText,
  moveInOrder,
  pickSacoIcon,
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
