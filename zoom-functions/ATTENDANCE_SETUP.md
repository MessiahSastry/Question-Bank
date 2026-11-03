# St. Patrick's School — verified Zoom attendance activation

Code status (4 Nov 2026)
- Teacher dashboard and Download PDF deployed on GitHub Pages.
- Student Meeting SDK creates a unique `[SP-...]` tag for each verified school student join.
- The signed webhook handler is prepared in `zoom-functions/attendance.js` but is intentionally **not exported yet**. Its Zoom webhook verification secret must be created first.
- Until signed Zoom webhook events arrive, teacher attendance shows Pending/Unverified. Teachers may manually select Present or Absent.

One-time configuration (do not put secret tokens in GitHub or ChatGPT)
1. In the existing Zoom General App, find its **Event Subscription Secret Token** (different from the OAuth Client Secret).
2. In Google Cloud Secret Manager, project `stpatricks-questionbank`, create a secret **ZOOM_WEBHOOK_SECRET_TOKEN** and store the exact Zoom Event Subscription Secret Token as a secret version. Never paste it into a website HTML file or GitHub commit.
3. After the secret exists, add `Object.assign(exports, require('./attendance'));` to `zoom-functions/index.js` and deploy the Zoom functions codebase.
4. In the Zoom app's Event Subscriptions, configure the endpoint `https://asia-south1-stpatricks-questionbank.cloudfunctions.net/zoomAttendanceWebhook`.
5. Select all four events: `meeting.started`, `meeting.ended`, `meeting.participant_joined`, `meeting.participant_left`. Ensure the app has required Zoom event scopes (including meeting participant read). Choose events for users who installed the app as appropriate.
6. Click **Validate** in Zoom, save the subscription, and complete any necessary app update or reauthorization.
7. Run a new class on two devices, admit a school SDK student, disconnect/rejoin, end the meeting, then use **Refresh Attendance** and **Download PDF**.

Attendance integrity
- Final automatic status uses *completed Zoom event intervals* clamped to the actual Zoom meeting start/end.
- Missing meeting start/end or missing exit records => Pending/Unverified (not invented minutes).
- Present = verified duration >= actual duration - 7 minutes, with at least some verified attendance.
- Teacher override Present/Absent is stored in the pre-existing `meetings/{meetingId}/attendance/{studentId}` documents.
- The PDF includes roster, join time, duration out of actual session duration, and final status; detailed entry/exit rows remain in the teacher dashboard.
- No Firestore security rules or normal student sign-in flow were changed.
- Zoom webhooks measure actual meeting connections, **not** switching apps while the connection remains active. The existing SDK page-hiding detection separately attempts to leave the meeting.
