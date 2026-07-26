# Jaji

Jaji is a private classroom collaboration hub for sharing assignment work, discussing it in context, and checking it together. It is a React + Firebase application deployed on Firebase Hosting.

## What is included

- Password-first Firebase Authentication with a one-time email-link second step delivered through EmailJS
- Six-character classroom join codes and multi-class switching
- Classroom creator, contributor, and member roles
- Contributor access requests reviewed by the class creator
- Contributor-only assignment uploads to Google Drive
- Correct / needs-review voting with community verification labels and top-work sorting
- Real-time assignment discussion threads
- Dated class-wide announcements that automatically expire
- A per-item inbox that excludes your own activity and clears assignment notifications when viewed
- Class roster with creator moderation, role management, and member removal
- Contributor XP, five badge levels, home-page progress, and a weekly leaderboard
- Responsive, keyboard-accessible UI with reduced-motion support
- Firestore rules scoped to classroom membership and roles
- Firebase Hosting SPA routing with immutable Vite assets

## Local development

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm dev
```

The checked-in Firebase web config points at the production `jaji-app` project. Firebase web config values are public identifiers, not server credentials. To use a different project, copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values.

## Firebase setup

In the Firebase console:

1. Enable **Authentication → Sign-in method → Email/Password**, then enable **Email link (passwordless sign-in)**.
2. Add every production and preview hostname under **Authentication → Settings → Authorized domains**.
3. Create a Firestore database.
4. Deploy the checked-in access rules:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project jaji-app
```

The data model is organized under `classrooms/{classId}` with nested members, contributor requests, assignments, votes, messages, and announcements. A small `users/{uid}/classrooms` reference collection makes each user’s classroom switcher efficient.

### EmailJS sign-in delivery

Firebase Admin generates every one-time Auth link inside the free Netlify Function at `netlify/functions/send-email-sign-in-link.mjs`. EmailJS sends that link using a template with these parameters:

- `{{to_email}}`
- `{{to_name}}`
- `{{sign_in_link}}`
- `{{app_name}}`
- `{{expires_in}}`

Configure these server-only environment variables on the `jaji-auth` Netlify project:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON
EMAILJS_SERVICE_ID
EMAILJS_TEMPLATE_ID
EMAILJS_PUBLIC_KEY
EMAILJS_PRIVATE_KEY # optional
```

The function is deployed on Netlify's free tier, so Firebase remains on the Spark plan. It is rate-limited to one email per address per minute and no Firebase Admin or EmailJS credential is shipped to the browser.

## Validation

```bash
pnpm lint
pnpm test
pnpm build
```

## Deployment

The production app is hosted at [jaji-app.web.app](https://jaji-app.web.app). Build and deploy it with:

```bash
pnpm build
firebase deploy --only hosting
```

The `jaji-auth` Netlify project hosts only the secure email-link function; the app itself stays on Firebase Hosting. Deploy the function with:

```bash
netlify deploy --prod
```

If a fallback hostname is used, add it to Firebase Authentication’s authorized domains so sign-in links work there.

Rank badge artwork is adapted from the CC-BY [Game Icons badge collection](https://github.com/game-icons/icons).
