# Jaji

Jaji is a private classroom collaboration hub for sharing assignment work, discussing it in context, and checking it together. It is a React + Firebase application deployed as a static SPA on Netlify.

## What is included

- Email/password signup and sign-in with Firebase verification emails
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
- Netlify SPA redirects, immutable asset caching, and security headers

## Local development

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm dev
```

The checked-in Firebase web config points at the existing `jaji-5a88d` project. Firebase web config values are public identifiers, not server credentials. To use a different project, copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values.

## Firebase setup

In the Firebase console:

1. Enable **Authentication → Sign-in method → Email/Password**.
2. Add every production and preview hostname under **Authentication → Settings → Authorized domains**.
3. Create a Firestore database and a Firebase Storage bucket if they do not already exist.
4. Deploy the checked-in access rules:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project backend
```

The data model is organized under `classrooms/{classId}` with nested members, contributor requests, assignments, votes, messages, and announcements. A small `users/{uid}/classrooms` reference collection makes each user’s classroom switcher efficient.

## Validation

```bash
pnpm lint
pnpm test
pnpm build
```

## Netlify

The production app is hosted at [jaji-app.web.app](https://jaji-app.web.app). Build and deploy it with:

```bash
pnpm build
firebase deploy --only hosting
```

`netlify.toml` remains available as a fallback and contains the production build, SPA fallback, cache policy, and baseline security headers. To deploy there instead:

```bash
netlify deploy --build --prod
```

After the first deployment, add the Netlify hostname to Firebase Authentication’s authorized domains so verification links and sign-in work from production.
