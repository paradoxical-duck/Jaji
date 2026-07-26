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
  { key: 'bronze', name: 'Bronze', min: 0, next: 50 },
  { key: 'silver', name: 'Silver', min: 50, next: 150 },
  { key: 'gold', name: 'Gold', min: 150, next: 350 },
  { key: 'platinum', name: 'Platinum', min: 350, next: 700 },
  { key: 'diamond', name: 'Diamond', min: 700, next: null }
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
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
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
