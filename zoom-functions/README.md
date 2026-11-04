# St. Patrick's School online-class backend

This is the isolated Firebase Functions codebase `zoom`, running on Node.js 22.
It does not import or deploy the existing quiz/reminder functions.

## Current functions

| Function | Purpose |
| --- | --- |
| zoomOAuthStart | Starts a signed, one-use, ten-minute OAuth authorization for an approved school teacher. |
| zoomOAuthCallback | Checks state and current teacher approval, exchanges the Zoom code, encrypts tokens and stores them by teacher UID. |
| zoomConnectionStatus | Reports that teacher's connection and meeting scopes. |
| zoomCreateMeeting | Creates or updates the owning teacher's meeting, with revision and refresh-token locks. |
| zoomSdkParticipantSignature | Checks the joining window, class/section roster and registered parent mobile; returns a participant-only SDK signature and attendance tag. |
| zoomAttendanceWebhook | Validates signed Zoom events and atomically updates attendance evidence. |

Region: `asia-south1`. Hosting routes are defined in `../firebase.json`.
The teacher page runs on GitHub Pages; the Firebase teacher URL redirects there.
The student page is mirrored at the repository root and in `firebase-site/`.

## School teacher approval

A Firebase email account alone is **not** teacher authorization. The server and
teacher page require an administrator-issued `schoolTeacher: true` or
`schoolAdmin: true` Firebase custom claim. Client-editable profile fields do not count.

Before deploying this branch, approve existing staff UIDs in a trusted Admin SDK
environment. The supplied helper defaults to a read-only preview:

```bash
cd zoom-functions
node scripts/teacher-access.js --uid FIREBASE_UID --grant
```

After checking the exact UID, add `--apply` to make the change. Other custom
claims are preserved. Staff must sign in again to refresh their tokens.
`--revoke` removes only the teacher claim; an existing schoolAdmin claim still grants access.
This audit did not grant claims or change production Auth accounts.

## Secrets

The existing Secret Manager names are `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`,
`ZOOM_TOKEN_ENCRYPTION_KEY` (32 random bytes encoded as Base64), and
`ZOOM_WEBHOOK_SECRET_TOKEN`. Never put values in source, issues, logs or chat.
The webhook function is already exported; do not add a duplicate export.
OAuth uses signed state, not a browser cookie.

## Checks

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm test
npm run smoke
```

The smoke check loads real SDK exports against a non-production emulator
address and performs no database requests. The regression suite uses local
Firestore/Auth/Zoom doubles; it is not a live Zoom or Firestore emulator test.
A package lock makes builds reproducible. Runtime dependencies use the supported
modular Firebase Admin APIs.

## Deployment boundary

Review [the audit](../docs/online-class-audit.md) before rollout.
**Keep the existing Firebase/Firestore rules unchanged, as instructed by the owner.**
No rule replacement, rule deployment or export of live rules is required for this
work. [The access notes](FIRESTORE_REVIEW.md) record unverified security boundaries;
they are informational, not instructions to change rules.

`firebase.json` references a default `functions/` directory that is not present.
Do not run a blanket Firebase deployment.

After the owner approves rollout and the documented prerequisites are met,
deploy only the `zoom` functions codebase and the intended Hosting files.
Both deployment workflows trigger on `main`; merging this branch is a production
rollout action. Creating the branch/draft PR runs validation only.

No paid participant-report API, Child ID, OTP or new runtime dependency has been added.
Attendance keeps the seven-minute allowance and teacher overrides.
