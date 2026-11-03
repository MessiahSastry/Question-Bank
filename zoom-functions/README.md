# St. Patrick's School — isolated Zoom OAuth backend

This is a separate Firebase Functions codebase named **zoom**. It does not
import, change, or redeploy the existing quiz lookup and reminder functions.

## Functions

- zoomOAuthStart: requires the existing school Firebase account's signed-in,
  non-anonymous ID token with an email address, then creates a short-lived,
  HMAC-signed OAuth state and same-site cookie. School administrators provision
  Firebase teacher accounts; no manual per-teacher UID allowlist is required.
- zoomOAuthCallback: validates the state and cookie, exchanges the Zoom code
  on the server, encrypts access and refresh tokens, and saves them by
  Firebase teacher UID.
- Region: asia-south1 (Mumbai).
- Zoom Development OAuth redirect:
  https://stpatricks-questionbank.web.app/zoom/oauth/callback

## Important deployment precautions

**NOT DEPLOYED.** The repository does not contain the existing default
functions/ source, although two functions are live in Firebase. Never deploy
all functions from this partial checkout. The verified live Hosting release
contains only /index.html, /quiz.html and /404.html (plus two reserved
Firebase /__/ files); the branch preserves all three and stages two
additional Zoom online-class pages.

The existing GitHub Actions Hosting deployment triggers only when quiz.html
changes. A new separate workflow in this branch deploys ONLY functions:zoom
automatically when Zoom function source changes on main (or by manual
workflow_dispatch). It never deploys the default functions or Hosting.
It uses the existing GitHub Firebase service-account secret; IAM may need
additional roles for Functions deployment.

## Firebase Secret Manager

Do not commit Zoom credentials, encryption keys, OAuth tokens, or Firebase
service-account JSON files to GitHub.

Create three secrets in the Firebase project:

    firebase functions:secrets:set ZOOM_CLIENT_ID
    firebase functions:secrets:set ZOOM_CLIENT_SECRET
    firebase functions:secrets:set ZOOM_TOKEN_ENCRYPTION_KEY

For the third secret, generate a unique random 32-byte key in base64:

    node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"

Back up the encryption key securely. Losing it makes stored tokens unreadable.

## School teacher authentication

The school administrator provisions Firebase teacher accounts. The Zoom start
function requires a valid, non-revoked Firebase ID token with an email and
rejects anonymous accounts. There is no extra Firestore allowlist to maintain.
The OAuth state contains a server-signed identity/expiry binding so clients
cannot change the teacher UID or expiry by editing the pending record.

**Security limitation:** The school's existing broad Firestore rules are left
unchanged at the owner's request. Other signed-in users can still read, alter,
or delete Zoom Firestore documents, disrupting connections or changing metadata.
Zoom access/refresh tokens are encrypted server-side, with the key held only
in Google Secret Manager; no client receives plaintext tokens. Revisit rules
before broader production rollout.

## Teacher webpage integration (prepared on this branch)

The root-level online-class-teacher.html now includes a
"Connect My Zoom Account" button. It uses the signed-in teacher's Firebase
ID token to make a same-origin POST to /zoom/oauth/start and redirects to
Zoom only after the server returns an approved authorizationUrl. It stops
if the teacher has unsaved edits and displays an error if Firebase sign-in,
the secure backend, or the Hosting route is unavailable.

On this branch, firebase-site/ now includes copies of
online-class-teacher.html and online-class.html alongside the three existing
static Hosting files. The teacher page offers sign-in with existing Firebase
school credentials when opened on stpatricks-questionbank.web.app (sessions
from other origins are not automatically shared). The new button is **not live**
until the PR is merged and both isolated Functions and Hosting deploy.

The Zoom callback is validated using a 10-minute browser cookie and a
one-time Firestore state.

Do not click Zoom's standalone Add App Now for this school OAuth flow:
it does not create the custom one-time state or cookie.

## Deploy only after reviewing all hosted files

    npm --prefix zoom-functions install
    npm --prefix zoom-functions run check
    firebase deploy --only functions:zoom --project stpatricks-questionbank

The callback uses Hosting rewrites in firebase.json. The verified live
Hosting file list has been checked against the staged Hosting folder, which
preserves all three existing static files. The existing quiz Hosting workflow
on the PR now deploys for changes to Zoom Hosting pages or firebase.json,
copying the latest root quiz.html first. Confirm IAM, deployment order, and
OAuth callback routing before using real Zoom accounts.

## Not yet implemented

- Token refresh and revoke/disconnect
- Further Zoom meeting API permissions and secure identity retrieval
- Actual embedded Meeting SDK, meeting event verification and attendance
- The cumulative 5-minute missed-time allowance
- Zoom cross-account review and production approval
- Firestore rules hardening (deferred at the school owner's request) and end-to-end testing

Sources:
https://firebase.google.com/docs/functions/organize-functions
https://firebase.google.com/docs/functions/config-env
https://developers.zoom.us/docs/integrations/oauth/
https://developers.zoom.us/docs/meeting-sdk/auth/
