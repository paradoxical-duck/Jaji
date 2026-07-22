import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const emailJsServiceId = defineSecret('EMAILJS_SERVICE_ID');
const emailJsTemplateId = defineSecret('EMAILJS_TEMPLATE_ID');
const emailJsPublicKey = defineSecret('EMAILJS_PUBLIC_KEY');
const emailJsPrivateKey = defineSecret('EMAILJS_PRIVATE_KEY');

const APP_URL = 'https://jaji-app.web.app';
const MIN_SEND_INTERVAL_MS = 60_000;

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  return email;
}

function cleanName(value) {
  return String(value || '').trim().slice(0, 80) || 'classmate';
}

async function reserveSend(email) {
  const key = createHash('sha256').update(email).digest('hex');
  const ref = getFirestore().collection('emailRateLimits').doc(key);
  await getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const lastSentAt = snapshot.data()?.lastSentAt?.toMillis?.() || 0;
    if (Date.now() - lastSentAt < MIN_SEND_INTERVAL_MS) {
      throw new HttpsError('resource-exhausted', 'A link was already sent. Wait one minute before trying again.');
    }
    transaction.set(ref, { lastSentAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function deliverWithEmailJs({ email, name, link }) {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: emailJsServiceId.value(),
      template_id: emailJsTemplateId.value(),
      user_id: emailJsPublicKey.value(),
      accessToken: emailJsPrivateKey.value(),
      template_params: {
        to_email: email,
        to_name: name,
        sign_in_link: link,
        app_name: 'Jaji',
        expires_in: '1 hour'
      }
    })
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    console.error('EmailJS rejected sign-in email', response.status, detail);
    throw new HttpsError('internal', 'The email service could not send your link. Try again shortly.');
  }
}

export const sendEmailSignInLink = onCall({
  region: 'asia-south1',
  maxInstances: 5,
  timeoutSeconds: 30,
  secrets: [emailJsServiceId, emailJsTemplateId, emailJsPublicKey, emailJsPrivateKey]
}, async (request) => {
  const email = cleanEmail(request.data?.email);
  const name = cleanName(request.data?.name);
  await reserveSend(email);

  const link = await getAuth().generateSignInWithEmailLink(email, {
    url: `${APP_URL}/?finishSignIn=1`,
    handleCodeInApp: true
  });
  await deliverWithEmailJs({ email, name, link });
  return { sent: true };
});
