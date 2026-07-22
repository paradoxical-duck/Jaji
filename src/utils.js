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
