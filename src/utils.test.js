import { describe, expect, it } from 'vitest';
import { currentWeekKey, generateClassCode, isAnnouncementActive, normalizeClassCode, roleLabel, timeAgo, verificationState, xpProgress } from './utils';

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
  it('maps XP through five levels', () => {
    expect(xpProgress(0).level.name).toBe('Bronze');
    expect(xpProgress(150).level.name).toBe('Gold');
    expect(xpProgress(700).level.name).toBe('Diamond');
  });
  it('uses Monday as the weekly XP boundary', () => {
    expect(currentWeekKey(new Date('2026-07-26T10:00:00Z'))).toBe('2026-07-20');
  });
  it('expires reminders after their final day', () => {
    expect(isAnnouncementActive({ expiresOn: '2026-07-26' }, new Date('2026-07-26T10:00:00'))).toBe(true);
    expect(isAnnouncementActive({ expiresOn: '2026-07-25' }, new Date('2026-07-26T10:00:00'))).toBe(false);
  });
});
