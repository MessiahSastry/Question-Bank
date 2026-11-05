# Zoom attendance setup and teacher workflow

The signed webhook handler is exported from `index.js`. Its Secret Manager token
and Zoom event subscription must be checked before deployment; this audit did
not access secret values or change the Zoom app.

## Setup to verify before owner-approved rollout

1. Confirm `ZOOM_WEBHOOK_SECRET_TOKEN` contains the Zoom Event Subscription Secret
   Token, not the OAuth client secret.
2. The endpoint is
   `https://asia-south1-stpatricks-questionbank.cloudfunctions.net/zoomAttendanceWebhook`.
3. Subscribe to `meeting.started`, `meeting.ended`,
   `meeting.participant_joined` and `meeting.participant_left` for the teachers'
   installed Zoom app. Validate the endpoint and reauthorize scopes if required.
4. Keep the existing Firebase/Firestore rules unchanged. The access notes in
   `FIRESTORE_REVIEW.md` are informational and do not require rule changes.
5. Use a designated test teacher and synthetic/test roster to check joining,
   admission, disconnect/rejoin, an early meeting end, delayed records, overrides
   and PDF download. Measure webhook acknowledgement latency for a 40-45 student class.

## What teachers do

After the Zoom class ends, open Attendance and review the entry/exit records.
Records initially settle for two minutes. A positive verified duration meeting
the seven-minute allowance can show Present. Choose **Confirm Final Attendance**
only after checking missing/insufficient attendance against the class records.
This allows automatic Absent, including zero minutes for a student who never
joined. If evidence cannot be verified, keep it Pending or use an informed
teacher override. Incomplete or conflicting records stay Unverified.

A late signed participant event changes the attendance revision and invalidates
the earlier final-absence confirmation. Review the updated sheet and confirm again.
A teacher override continues to take precedence and is never overwritten by a webhook.

## Calculation and reconciliation

- Only signed Zoom entry/exit intervals count. Website Join clicks do not.
- Overlapping intervals are merged and clamped to actual meeting start/end.
- Present requires positive verified time of at least actual duration minus seven minutes.
- A 40-minute class requires 33 minutes; 32m 59s is below that threshold.
- Raw events and derived intervals commit atomically; retries are idempotent.
- Unidentified exits are retained for a later identifying join to repair.
- Missing boundaries, exits, unverified reads, truncated history or conflicting
  meeting UUIDs never create a definitive automatic absence.
- Reopening the same Zoom number as another instance requires manual review;
  the two sessions are not silently merged into one long class.

Zoom webhooks do not prove that a student watched the screen or stayed attentive.
The existing mobile page-switch guard still attempts a best-effort disconnect.
The parent-mobile flow remains self-identification, not proof of phone ownership.
The optional Zoom past-participant API requires a paid plan and is not used.

The PDF uses the same calculation as the table, includes teacher overrides,
and uses a compact portrait layout. A normal 40-45 student class can fit one A4
page; long names, long class details or larger rosters continue onto extra pages
without removing names. Unsaved overrides are identified before export and labelled
in the report. The PDF library loads locally first, with a fallback and retry path.
