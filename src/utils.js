const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateClassCode(length = 6, random = Math.random) {
  return Array.from({ length }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('');
}

export function normalizeClassCode(value = '') {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function timeAgo(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return 'just now';
  const seconds = Math.max(0, Math.floor((now - date) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatDate(value, options = {}) {
  const date = toDate(value);
  if (!date) return 'No date';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...options });
}

export function roleLabel(role) {
  return { owner: 'Class creator', contributor: 'Contributor', member: 'Member' }[role] || 'Member';
}

export const XP_LEVELS = [
  { key: 'garnet', name: 'Garnet', title: 'First Spark', min: 0, next: 60, image: '/badges/tier-garnet.png' },
  { key: 'amethyst', name: 'Amethyst', title: 'Idea Weaver', min: 60, next: 180, image: '/badges/tier-amethyst.png' },
  { key: 'sapphire', name: 'Sapphire', title: 'Deep Scholar', min: 180, next: 400, image: '/badges/tier-sapphire.png' },
  { key: 'emerald', name: 'Emerald', title: 'Class Catalyst', min: 400, next: 800, image: '/badges/tier-emerald.png' },
  { key: 'diamond', name: 'Diamond', title: 'Prism Laureate', min: 800, next: null, image: '/badges/tier-diamond.png' }
];

export function xpLevel(xp = 0) {
  return [...XP_LEVELS].reverse().find((level) => xp >= level.min) || XP_LEVELS[0];
}

export function xpProgress(xp = 0) {
  const level = xpLevel(xp);
  if (!level.next) return { level, percent: 100, remaining: 0 };
  const span = level.next - level.min;
  const earned = Math.max(0, xp - level.min);
  return {
    level,
    percent: Math.min(100, Math.round((earned / span) * 100)),
    remaining: Math.max(0, level.next - xp)
  };
}

export function currentWeekKey(date = new Date()) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

export function utcDateKey(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
}

export function periodKeys(date = new Date()) {
  const day = utcDateKey(date);
  return { day, week: currentWeekKey(date), month: day.slice(0, 7), year: day.slice(0, 4) };
}

export function streakBonusFor(days = 0) {
  if (days >= 30) return 20;
  if (days >= 14) return 12;
  if (days >= 7) return 8;
  if (days >= 3) return 4;
  return 0;
}

export function currentStreak(member, now = new Date()) {
  const { day } = periodKeys(now);
  const yesterday = new Date(`${day}T00:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return [day, utcDateKey(yesterday)].includes(member?.lastContributionDate) ? Math.max(0, Number(member?.streakDays || 0)) : 0;
}

export function calculateXpAward(member = {}, baseAmount = 0, now = new Date()) {
  const keys = periodKeys(now);
  const yesterday = new Date(`${keys.day}T00:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const isNewDay = member.lastContributionDate !== keys.day;
  const streakDays = isNewDay
    ? (member.lastContributionDate === utcDateKey(yesterday) ? Math.max(0, Number(member.streakDays || 0)) + 1 : 1)
    : Math.max(0, Number(member.streakDays || 0));
  const bonusXp = isNewDay ? streakBonusFor(streakDays) : 0;
  const earnedXp = Math.max(0, Number(baseAmount || 0)) + bonusXp;
  const update = {
    xp: Math.max(0, Number(member.xp || 0)) + earnedXp,
    weeklyXp: member.xpWeek === keys.week ? Math.max(0, Number(member.weeklyXp || 0)) + earnedXp : earnedXp,
    xpWeek: keys.week,
    monthlyXp: member.xpMonth === keys.month ? Math.max(0, Number(member.monthlyXp || 0)) + earnedXp : earnedXp,
    xpMonth: keys.month,
    yearlyXp: member.xpYear === keys.year ? Math.max(0, Number(member.yearlyXp || 0)) + earnedXp : earnedXp,
    xpYear: keys.year,
    streakDays,
    lastContributionDate: isNewDay ? keys.day : member.lastContributionDate,
    lastAwardBase: Math.max(0, Number(baseAmount || 0)),
    lastAwardBonus: bonusXp
  };
  if (member.xpWeek && member.xpWeek !== keys.week) {
    update.previousWeekKey = member.xpWeek;
    update.previousWeeklyXp = Math.max(0, Number(member.weeklyXp || 0));
  }
  if (member.xpMonth && member.xpMonth !== keys.month) {
    update.previousMonthKey = member.xpMonth;
    update.previousMonthlyXp = Math.max(0, Number(member.monthlyXp || 0));
  }
  if (member.xpYear && member.xpYear !== keys.year) {
    update.previousYearKey = member.xpYear;
    update.previousYearlyXp = Math.max(0, Number(member.yearlyXp || 0));
  }
  return update;
}

export function isAnnouncementActive(announcement, now = new Date()) {
  if (!announcement?.expiresOn) return true;
  const end = new Date(`${announcement.expiresOn}T23:59:59.999`);
  return !Number.isNaN(end.getTime()) && end >= now;
}

export function verificationState(upvotes = 0, downvotes = 0) {
  const total = upvotes + downvotes;
  const ratio = total ? upvotes / total : 0;
  if (upvotes >= 2 && ratio >= 0.67) return { key: 'verified', label: 'Community verified' };
  if (downvotes >= 2 && ratio < 0.5) return { key: 'review', label: 'Needs review' };
  return { key: 'pending', label: total ? 'Verification in progress' : 'Not yet checked' };
}

export function initials(name = '') {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

export function firebaseMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter the same valid email address that received this sign-in link.',
    'auth/weak-password': 'Use at least 8 characters for your password.',
    'auth/operation-not-allowed': 'Password sign-in is not enabled yet. Try again shortly.',
    'auth/user-not-found': 'The email or password is incorrect.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/invalid-action-code': 'This sign-in link has expired or was already used. Request a fresh link.',
    'auth/unauthorized-continue-uri': 'This website is not authorized for email sign-in yet.',
    'functions/resource-exhausted': 'A link was already sent. Wait one minute before trying again.',
    'functions/internal': 'The email service could not send your link. Try again shortly.',
    'functions/unavailable': 'The email service is temporarily unavailable. Try again shortly.',
    'storage/unauthorized': 'You do not have permission to upload to this class.'
  };
  return messages[code] || error?.message?.replace(/^Firebase:\s*/, '') || 'Something went wrong. Try again.';
}
