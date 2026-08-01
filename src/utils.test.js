import { describe, expect, it } from 'vitest';
import { calculateXpAward, currentStreak, currentWeekKey, generateClassCode, initials, isAnnouncementActive, normalizeClassCode, roleLabel, timeAgo, verificationState, xpProgress } from './utils';

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
  it('handles missing legacy profile names', () => {
    expect(initials(null)).toBe('?');
    expect(initials(undefined)).toBe('?');
    expect(initials('  Ava Patel  ')).toBe('AP');
  });
  it('formats recent activity', () => {
    expect(timeAgo(new Date('2026-07-22T10:00:00Z'), new Date('2026-07-22T10:25:00Z'))).toBe('25m ago');
  });
  it('maps XP through five levels', () => {
    expect(xpProgress(0).level.name).toBe('Garnet');
    expect(xpProgress(150).level.name).toBe('Amethyst');
    expect(xpProgress(180).level.name).toBe('Sapphire');
    expect(xpProgress(800).level.name).toBe('Diamond');
  });
  it('uses Monday as the weekly XP boundary', () => {
    expect(currentWeekKey(new Date('2026-07-26T10:00:00Z'))).toBe('2026-07-20');
  });
  it('expires reminders after their final day', () => {
    expect(isAnnouncementActive({ expiresOn: '2026-07-26' }, new Date('2026-07-26T10:00:00'))).toBe(true);
    expect(isAnnouncementActive({ expiresOn: '2026-07-25' }, new Date('2026-07-26T10:00:00'))).toBe(false);
  });
});

describe('XP periods and streaks', () => {
  it('rolls weekly, monthly, and yearly XP without losing completed totals', () => {
    const result = calculateXpAward({ xp: 90, weeklyXp: 40, xpWeek: '2025-12-29', monthlyXp: 70, xpMonth: '2025-12', yearlyXp: 90, xpYear: '2025', streakDays: 0 }, 20, new Date('2026-01-05T10:00:00Z'));
    expect(result).toMatchObject({ xp: 110, weeklyXp: 20, xpWeek: '2026-01-05', monthlyXp: 20, xpMonth: '2026-01', yearlyXp: 20, xpYear: '2026', previousWeeklyXp: 40, previousMonthlyXp: 70, previousYearlyXp: 90 });
  });
  it('grants one streak bonus per day and keeps a one-day grace window', () => {
    const first = calculateXpAward({ xp: 30, streakDays: 2, lastContributionDate: '2026-07-31' }, 8, new Date('2026-08-01T10:00:00Z'));
    expect(first).toMatchObject({ xp: 42, streakDays: 3, lastAwardBonus: 4 });
    const second = calculateXpAward({ ...first }, 8, new Date('2026-08-01T18:00:00Z'));
    expect(second.lastAwardBonus).toBe(0);
    expect(second.streakDays).toBe(3);
    expect(currentStreak(first, new Date('2026-08-02T10:00:00Z'))).toBe(3);
  });
});
