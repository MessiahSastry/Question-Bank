# St. Patrick's School — isolated Zoom OAuth backend

This is a separate Firebase Functions codebase named **zoom**. It does not
import, change, or redeploy the existing quiz lookup and reminder functions.

## Functions

- zoomOAuthStart: requires a valid Firebase teacher ID token and a school
  administrator's explicit allowlist entry, then creates a short-lived
  one-time OAuth state and secure same-site cookie.
- zoomOAuthCallback: validates the state and cookie, exchanges the Zoom code
  on the server, encrypts access and refresh tokens, and saves them by
  Firebase teacher UID.
- Region: asia-south1 (Mumbai).
- Zoom Development OAuth redirect:
  https://stpatricks-questionbank.web.app/zoom/oauth/callback

## Important deployment precautions

**NOT DEPLOYED.** The repository does not contain the existing default
functions/ source, although two functions are live in Firebase. Never deploy
all functions from this partial checkout. The directory firebase-site/
also contains only part of the main repository: confirm every live Hosting
asset is included before deploying Hosting or you may overwrite pages.

Current GitHub Actions deploys Hosting when quiz.html changes, but does
not deploy this Zoom codebase.

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

## Teacher allowlist

Grant access only to actual school teachers. Add a Firestore document using
privileged administrator access:

    zoomTeacherAccess/{firebaseTeacherUid}
      enabled: true

The start handler verifies Firebase Auth and checks this allowlist. Firestore
rules must deny client access to zoomTeacherCredentials, zoomOAuthPending,
and restrict zoomTeacherAccess changes to authorised administrators.

## Next: connect this with the school's teacher webpage

Teacher-page integration is not yet added. A Firebase-authenticated teacher
on the school Hosting domain should make a same-origin POST to
/zoom/oauth/start with an Authorization: Bearer <Firebase ID token> header.
The JSON response contains authorizationUrl; navigate the browser to it.
The Zoom callback is validated using a 10-minute browser cookie and a
one-time Firestore state.

Do not click Zoom's standalone Add App Now for this school OAuth flow:
it does not create the custom one-time state or cookie.

## Deploy only after reviewing all hosted files

    npm --prefix zoom-functions install
    npm --prefix zoom-functions run check
    firebase deploy --only functions:zoom --project stpatricks-questionbank

The callback uses Hosting rewrites in firebase.json. Those rewrites require
a carefully reviewed Hosting deployment. Do not run blanket Hosting deploy
from an incomplete firebase-site/ directory.

## Not yet implemented

- Teacher-facing Connect My Zoom Account button
- Token refresh and revoke/disconnect
- Further Zoom meeting API permissions and secure identity retrieval
- Actual embedded Meeting SDK, meeting event verification and attendance
- The cumulative 5-minute missed-time allowance
- Zoom cross-account review and production approval
- Firestore rules validation and end-to-end testing

Sources:
https://firebase.google.com/docs/functions/organize-functions
https://firebase.google.com/docs/functions/config-env
https://developers.zoom.us/docs/integrations/oauth/
https://developers.zoom.us/docs/meeting-sdk/auth/
