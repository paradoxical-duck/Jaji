import { describe, expect, it } from 'vitest';
import { generateClassCode, normalizeClassCode, roleLabel, timeAgo, verificationState } from './utils';

describe('class codes', () => {
  it('normalizes pasted codes', () => expect(normalizeClassCode(' ab-12 c! ')).toBe('AB12C'));
  it('generates an unambiguous six-character code', () => {
    expect(generateClassCode(6, () => 0)).toBe('AAAAAA');
    expect(generateClassCode(6, () => 0.999)).toHaveLength(6);
  });
});

describe('verification labels', () => {
  it('requires two positive checks', () => expect(verificationState(2, 0).key).toBe('verified'));
  it('flags disputed work', () => expect(verificationState(1, 3).key).toBe('review'));
  it('keeps new work pending', () => expect(verificationState(0, 0).key).toBe('pending'));
});

describe('display helpers', () => {
  it('labels roles', () => expect(roleLabel('contributor')).toBe('Contributor'));
  it('formats recent activity', () => {
    expect(timeAgo(new Date('2026-07-22T10:00:00Z'), new Date('2026-07-22T10:25:00Z'))).toBe('25m ago');
  });
});
