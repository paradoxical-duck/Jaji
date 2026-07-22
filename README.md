# Jaji

Jaji is a private classroom collaboration hub for sharing assignment work, discussing it in context, and checking it together. It is a React + Firebase application deployed on Firebase Hosting.

## What is included

- Passwordless Firebase Authentication links delivered through EmailJS
- Six-character classroom join codes and multi-class switching
- Classroom creator, contributor, and member roles
- Contributor access requests reviewed by the class creator
- Contributor-only assignment uploads to Firebase Storage
- Correct / needs-review voting with community verification labels and top-work sorting
- Real-time assignment discussion threads
- Class-wide reminders and announcements
- A working inbox that summarizes new work, reminders, and contributor request updates
- Class roster grouped by creator, contributors, and members
- Responsive, keyboard-accessible UI with reduced-motion support
- Firestore and Storage rules scoped to classroom membership and roles
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
3. Create a Firestore database and a Firebase Storage bucket if they do not already exist.
4. Deploy the checked-in access rules:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project jaji-app
```

The data model is organized under `classrooms/{classId}` with nested members, contributor requests, assignments, votes, messages, and announcements. A small `users/{uid}/classrooms` reference collection makes each user’s classroom switcher efficient.

### EmailJS sign-in delivery

Firebase Admin generates every one-time Auth link inside the `sendEmailSignInLink` Cloud Function. EmailJS sends that link using a template with these parameters:

- `{{to_email}}`
- `{{to_name}}`
- `{{sign_in_link}}`
- `{{app_name}}`
- `{{expires_in}}`

Configure the server-side secrets before deploying functions:

```bash
firebase functions:secrets:set EMAILJS_SERVICE_ID
firebase functions:secrets:set EMAILJS_TEMPLATE_ID
firebase functions:secrets:set EMAILJS_PUBLIC_KEY
firebase functions:secrets:set EMAILJS_PRIVATE_KEY
firebase deploy --only functions
```

Cloud Functions deployment requires the Firebase project to use the Blaze plan. The function is rate-limited to one email per address per minute and the EmailJS private key is never shipped to the browser.

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

`netlify.toml` remains available only as a fallback. To deploy there instead:

```bash
netlify deploy --build --prod
```

If a fallback hostname is used, add it to Firebase Authentication’s authorized domains so sign-in links work there.
