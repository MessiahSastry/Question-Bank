# St. Patrick's School online-class backend

This is the isolated Firebase Functions codebase `zoom`, running on Node.js 22.
It does not import or deploy the existing quiz/reminder functions.

## Current functions

| Function | Purpose |
| --- | --- |
| zoomOAuthStart | Starts a signed, one-use, ten-minute OAuth authorization using the existing CampusConnect teacher sign-in. |
| zoomOAuthCallback | Checks state and the existing account status, exchanges the Zoom code, encrypts tokens and stores them by teacher UID. |
| zoomConnectionStatus | Reports that teacher's connection and meeting scopes. |
| zoomCreateMeeting | Creates or updates the owning teacher's meeting, with revision and refresh-token locks. |
| zoomSdkParticipantSignature | Checks the joining window, class/section roster and registered parent mobile; returns a participant-only SDK signature and attendance tag. |
| zoomAttendanceWebhook | Validates signed Zoom events and atomically updates attendance evidence. |

Region: `asia-south1`. Hosting routes are defined in `../firebase.json`.
The teacher page runs on GitHub Pages; the Firebase teacher URL redirects there.
The student page is mirrored at the repository root and in `firebase-site/`.

## Existing teacher permissions

Reuse the existing CampusConnect sign-in, teacher UID and owning-teacher checks.
Teachers do not need new custom claims, an individual allowlist, approval flags,
or any other per-teacher setup. Existing administrator/coordinator permissions
in other school pages are unchanged. No profile schema or Firebase rules change
is required.

The backend verifies existing Firebase ID tokens, rejects anonymous student
sessions for teacher endpoints, and keeps teacherId ownership checks on meetings.
OAuth completion also checks that the same account is still active. This does
not create a new teacher permission system or establish new database rule protections.
No live Auth accounts or permissions were changed during this work.

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
