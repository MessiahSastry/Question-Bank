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

- Source for the existing `default` functions is **not** in this GitHub repo.
  Never run a blanket Functions deployment.
- The Firebase Hosted site uses `firebase-site/`, which does not yet include
  the root-level teacher webpage. Audit live Hosting assets before deploying.
- Do not merge the draft PR or deploy until the rollout is reviewed.
- Authorise teachers explicitly using `zoomTeacherAccess/{uid}` with
  `enabled: true`, set by a trusted administrator, not by public clients.
- Add secure Firestore rules for Zoom-related collections.
- After deployment, verify secrets and service-account permissions using a
  test teacher account, not live student data.

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
