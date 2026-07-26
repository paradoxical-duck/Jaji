import { createHash } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const APP_URL = 'https://jaji-app.web.app';
const ALLOWED_ORIGINS = new Set([APP_URL, 'http://localhost:5173', 'http://127.0.0.1:5173']);
const MIN_SEND_INTERVAL_MS = 60_000;

function response(status, body, origin = APP_URL) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : APP_URL,
      'Content-Type': 'application/json; charset=utf-8',
      'Vary': 'Origin'
    }
  });
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

function cleanName(value) {
  return String(value || '').trim().slice(0, 80) || 'classmate';
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error('Firebase Admin credentials are not configured.');
  }
  return initializeApp({ credential: cert(serviceAccount) });
}

async function reserveSend(email) {
  const key = createHash('sha256').update(email).digest('hex');
  const database = getFirestore(getAdminApp());
  const ref = database.collection('emailRateLimits').doc(key);
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const lastSentAt = snapshot.data()?.lastSentAt?.toMillis?.() || 0;
    if (Date.now() - lastSentAt < MIN_SEND_INTERVAL_MS) {
      throw new Error('A link was already sent. Wait one minute before trying again.');
    }
    transaction.set(ref, { lastSentAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function deliverWithEmailJs({ email, name, link }) {
  const body = {
    service_id: process.env.EMAILJS_SERVICE_ID,
    template_id: process.env.EMAILJS_TEMPLATE_ID,
    user_id: process.env.EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: email,
      to_name: name,
      sign_in_link: link,
      app_name: 'Jaji',
      expires_in: '1 hour'
    }
  };
  if (process.env.EMAILJS_PRIVATE_KEY) body.accessToken = process.env.EMAILJS_PRIVATE_KEY;

  const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!emailResponse.ok) {
    const detail = (await emailResponse.text()).slice(0, 300);
    console.error('EmailJS rejected sign-in email', emailResponse.status, detail);
    throw new Error('The email service could not send your link. Try again shortly.');
  }
}

function directAppLink(firebaseLink) {
  const generated = new URL(firebaseLink);
  const target = new URL(APP_URL);
  for (const field of ['apiKey', 'mode', 'oobCode', 'lang']) {
    const value = generated.searchParams.get(field);
    if (value) target.searchParams.set(field, value);
  }
  target.searchParams.set('finishSignIn', '1');
  return target.toString();
}

export default async (request) => {
  const origin = request.headers.get('origin') || APP_URL;
  if (request.method === 'OPTIONS') return response(204, {}, origin);
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed.' }, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return response(403, { error: 'Origin not allowed.' }, origin);

  try {
    const payload = await request.json();
    const email = cleanEmail(payload.email);
    const name = cleanName(payload.name);
    const authorization = request.headers.get('authorization') || '';
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!idToken) return response(401, { error: 'Sign in with your password first.' }, origin);
    const verified = await getAuth(getAdminApp()).verifyIdToken(idToken);
    if (String(verified.email || '').toLowerCase() !== email) {
      return response(403, { error: 'The signed-in email does not match.' }, origin);
    }
    await reserveSend(email);
    const firebaseLink = await getAuth(getAdminApp()).generateSignInWithEmailLink(email, {
      url: `${APP_URL}/?finishSignIn=1`,
      handleCodeInApp: true
    });
    const link = directAppLink(firebaseLink);
    await deliverWithEmailJs({ email, name, link });
    return response(200, { sent: true }, origin);
  } catch (error) {
    console.error('Sign-in link request failed', error);
    const safeMessage = /valid email|already sent/i.test(error.message)
      ? error.message
      : 'The email service could not send your link. Try again shortly.';
    return response(400, { error: safeMessage }, origin);
  }
};
