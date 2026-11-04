# Zoom private credential setup — St. Patrick's School

**Project:** `stpatricks-questionbank`  
**Environment:** Zoom **Development**, not Production  
**Never post credential values in GitHub, HTML, screenshots, or chat.**

## Option 1: Google Cloud Console (no local terminal needed)

1. Open Google Cloud Console → **Security → Secret Manager** for project `stpatricks-questionbank`.
2. Enable the Secret Manager API if Google requests it.
3. Click **Create secret** and create these exact names (one at a time):

| Secret ID | Secret value to paste |
| --- | --- |
| `ZOOM_CLIENT_ID` | Zoom Developer portal → Basic information → Development Client ID |
| `ZOOM_CLIENT_SECRET` | Zoom Developer portal → Basic information → Development Client secret |
| `ZOOM_TOKEN_ENCRYPTION_KEY` | A newly generated, random 32-byte key, Base64 encoded |

For each, paste the value only inside Google Cloud's **Secret value** field,
keep automatic replication where offered, and click **Create secret**.

Generate the encryption key with Cloud Shell by running:

```bash
openssl rand -base64 32
```

Copy the output privately into `ZOOM_TOKEN_ENCRYPTION_KEY`, not into GitHub.
Store a secure backup in an approved password manager.

## Option 2: Firebase CLI

From an authorised local project session:

```bash
firebase functions:secrets:set ZOOM_CLIENT_ID --project stpatricks-questionbank
firebase functions:secrets:set ZOOM_CLIENT_SECRET --project stpatricks-questionbank
firebase functions:secrets:set ZOOM_TOKEN_ENCRYPTION_KEY --project stpatricks-questionbank
```

The CLI prompts for secret values. Do not put secrets on the command line or
save them into tracked files.

## Prerequisites for deployment

- The `default` functions source is not in this repository. Never run a blanket Functions deployment.
- Firebase Hosting serves `firebase-site/`. Its teacher page redirects to the GitHub Pages teacher page; the student page is mirrored from the root source.
- Teacher accounts need server-issued `schoolTeacher: true` or `schoolAdmin: true` custom claims before this branch is deployed. See `README.md` for the dry-run-first helper. An email account alone is insufficient.
- Retrieve and review the live Firestore rules with `FIRESTORE_REVIEW.md`. They are absent from this repository; this audit did not change them.
- The attendance webhook is already exported and additionally requires `ZOOM_WEBHOOK_SECRET_TOKEN`, the Zoom Event Subscription Secret Token. Store it privately in Secret Manager and validate the four-event subscription described in `ATTENDANCE_SETUP.md`.
- Review rollout order and owner approval before merging: the existing main-branch workflows deploy production.
- Use a designated test teacher and synthetic roster for integration checks. No production data was changed during this audit.

## Secrets and scopes

- `ZOOM_CLIENT_ID` is technically a public identifier but stored as a Firebase
  secret to simplify server-only configuration.
- Never expose `ZOOM_CLIENT_SECRET` or Zoom OAuth refresh tokens to clients.
- If any secret is exposed, rotate it immediately in Zoom/Google Cloud and
  redeploy affected functions.

References:
- https://docs.cloud.google.com/secret-manager/docs/creating-and-accessing-secrets
- https://firebase.google.com/docs/functions/config-env
- https://developers.zoom.us/docs/integrations/create/
