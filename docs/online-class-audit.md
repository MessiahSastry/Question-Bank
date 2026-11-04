# St. Patrick's School online-class audit

Review date: 4 November 2026. Source baseline:
`d27a33d51a8372b3bddf3a085cc799401f28cab2` on `main`.

This branch contains source fixes for review. It has not been merged or deployed.
No production Firestore data, Auth accounts, Zoom accounts, secrets or subscriptions
were changed. No new runtime dependency or paid service was introduced.

## Scope and preserved behaviour

The complete repository inventory was reviewed. The detailed code review covers
the teacher/student pages and their Firebase copies/redirect, all Zoom backend
modules, school registration/roster dependencies, Firebase configuration and
deployment workflows. Unrelated applications were not modified or represented
as having received a full security audit.

The registered parent-mobile flow, two student confirmations, sibling selection,
seven-minute attendance allowance, owning-teacher management of multiple sessions,
manual attendance overrides, portrait PDF downloads and Zoom Waiting Room settings
are retained. No Child ID or OTP requirement was added. Quiz source, quiz assets,
question generation and quiz data were not changed. The existing Hosting workflow
still copies its unchanged quiz source as it did before this branch.

## Confirmed defects and implemented fixes

| Area | Confirmed source defect | Result on this branch |
| --- | --- | --- |
| Teacher authorization | An email Firebase account was accepted as a teacher although register.html permits email account creation. | Teacher page and teacher APIs require server-issued approval claims. OAuth callback checks the current account again. A dry-run-first staff approval helper is supplied. |
| Webhook retry | Raw events could persist before projection failed; a duplicate retry then returned before rebuilding. | Raw evidence, orphan repair and attendance projection commit atomically. Retries repair legacy incomplete projections. |
| Concurrent events | Separate history reads and attendance writes could publish an older projection over a newer one. | Transactions serialize through each student attendance row, retaining the latest complete evidence and teacher override fields. |
| Event order | An exit arriving before the student's identifying join could be discarded. | Unidentified signed events are retained and attached when a later event establishes that participant binding. |
| Duplicate events | Display-name/tag changes could change the event ID. | Canonical event identity excludes the name/tag; timeline reconciliation also deduplicates legacy equivalents. |
| Session identity | Earliest start/latest end could silently span different instances sharing a Zoom meeting number. | Different UUIDs create an explicit review issue; separate sessions are not combined automatically. |
| Missing attendance | A meeting end plus an arbitrary two-minute delay was treated as enough evidence to mark no-record students Absent. | Missing/insufficient time stays Pending until an owning teacher reviews and confirms final attendance. New evidence invalidates the confirmation. |
| Read failures | Attendance reads could be cached or unavailable while a no-record row still appeared final. | Final automatic status requires successful server reads. Failed refreshes return automatic results to Pending while preserving overrides. |
| Integrity flags | Truncated, malformed or unmatched evidence was not consistently surfaced. | Such records remain Unverified; nothing silently rounds or fills missing time. |
| Early end | Joining could remain available after Zoom ended earlier than the schedule. | Both student code and the SDK endpoint close joining on actual end. The teacher Start action also closes. |
| Rescheduling | An already-started class could reuse its existing attendance history under a new timetable. | Create a new class after verified Zoom activity; edits are blocked in the UI and save transaction. |
| Token refresh | A request could refresh from a stale token snapshot even after another request rotated it. | Credentials are reread under the per-teacher lock and a newly refreshed token is reused. Reconnection clears obsolete locks. |
| SDK/mobile | SDK success was used as a connection signal; disconnect/reconnect events were ignored and duplicate join actions remained possible. | Actual Zoom status events control connection messages and rejoin availability. An active SDK session blocks another join or student switch. Existing permission settling and page-switch behaviour remain. SDK/service timeouts offer a retry path. |
| Deployment coverage | Root online-class.html changes did not trigger Hosting deployment or PR checks. | Both source and hosted student pages are validated, and root student changes trigger staging/Hosting. |
| Validation/dependencies | Only index.js was checked; no regression suite or dependency lock was present. | All online-class modules/pages/config are checked, 70 behaviour tests and real SDK-load smoke checks run in CI, and npm ci uses a committed lock. Existing Firebase packages were updated and code migrated to their supported modular Admin APIs. |
| Setup instructions | Documentation described an unexported webhook and cookie-based OAuth, despite current exports/state behaviour. | Setup documentation now matches the implementation and rollout prerequisites. |

## Attendance policy

| Evidence | Automatic result after actual end and settlement |
| --- | --- |
| 40-minute class, 33 verified minutes | Present. |
| 40-minute class, 32m 59s | Pending until teacher review; Absent after confirmation. |
| No Zoom join | 0 minutes; Pending until teacher review, then Absent after confirmation. |
| Missing exit, unmatched exit, malformed/truncated history or conflicting instance | Unverified; teacher override remains available. |
| No reliable actual meeting start/end or failed server read | Pending; no invented duration or absence. |
| Teacher override | Teacher choice takes precedence, including in the PDF. |

Intervals are clamped to actual session boundaries and overlaps are merged. A
positive amount of attendance is required even if the allowance exceeds a short
class's duration. A website Join click never counts as presence.

**Confirm Final Attendance is an explicit teacher review, not an assertion that
Zoom delivered every event.** Zoom retries can arrive much later than two minutes.
If missing evidence cannot be checked, do not confirm it. A new participant-event
revision or changed actual boundaries makes an old confirmation inapplicable.

Zoom's past-participant API requires a paid plan, so it was not added. The free
workflow uses signed events plus the existing teacher's ability to verify and
override attendance. Mobile page hiding remains a best-effort disconnect; neither
webhooks nor the SDK prove attention or viewing time.

## Affected files

| Files | Purpose |
| --- | --- |
| online-class-teacher.html | Teacher approval, session lifecycle, final-attendance confirmation and refresh behaviour. |
| online-class.html; firebase-site/online-class.html | Student joining, SDK connection state, timeouts and matching hosted copy. |
| zoom-functions/index.js, meetings.js, sdk.js, attendance.js | Approved access, token refresh, join checks and atomic webhook processing. |
| zoom-functions/auth.js; attendance-model.js | Shared teacher authorization and pure event reconciliation. |
| zoom-functions/package.json; package-lock.json | Supported Firebase versions and reproducible dependency installation. |
| scripts/check-online-class.js; zoom-functions/scripts/*; zoom-functions/test/* | Syntax/config checks, safe staff approval helper, runtime smoke check and regression suite. |
| .github/workflows/firebase-functions-zoom.yml; firebase-hosting-merge.yml; zoom-pr-checks.yml | Validation gates, locked installation, pinned deployment CLI and student-source trigger coverage. |
| docs/online-class-audit.md; zoom-functions/README.md; ATTENDANCE_SETUP.md; SECRET_SETUP.md; FIRESTORE_REVIEW.md | Audit, limits and reviewed rollout requirements. |

## Validation performed

- Node.js 22.23.4: all online-class syntax, source/hosted student equality and Hosting route checks passed.
- 70 local regression tests passed: teacher approval, OAuth state/replay/revocation,
  meeting ownership/create/update/concurrency, token refresh, webhook authentication,
  event failure/retry/order/deduplication, SDK roster/phone/window checks, reconnection,
  interval union/thresholds, confirmations, overrides and PDF pagination.
- The real installed Firebase Admin 14.5.0 / Firebase Functions 7.4.0 packages load
  all six exports in a non-production, no-request smoke check.
- A synthetic 45-student portrait PDF generated successfully as three A4 pages;
  rendered pages were visually checked for headers, columns, row continuity and footers.
- Dependency audit after the update: **0 high, 0 critical, 6 moderate findings**.
  Remaining transitive findings are glob/minimatch through rimraf and Google client
  dependencies (gaxios, gcp-metadata, google-gax). The normal non-force audit fix did
  not resolve them. No unsupported dependency overrides were forced.
- Diff whitespace checks passed using the repository's existing CRLF convention.
- The latest recorded GitHub Pages, Firebase Hosting and isolated Zoom Functions
  runs at review time completed successfully. Those are historical baseline results,
  not a deployment or live validation of this branch.

The regression suite uses offline Firestore/Auth/Zoom doubles. It does not prove
Firestore transaction throughput, rule enforcement, production IAM, Zoom app
configuration, real Android browser/media behaviour or live webhook latency.
Those need an isolated integration test after the configuration review.

## Release blockers and residual risks

1. **Existing Firebase/Firestore rules remain unchanged by owner instruction.**
   No rule export, replacement or deployment is required for this work. The live
   rules were not inspected, so their database-level protection is unverified.
   [The access matrix](../zoom-functions/FIRESTORE_REVIEW.md) is informational,
   not a rule-change requirement. Backend checks do not establish that existing
   direct browser database permissions are restricted; this audit makes no such claim.
2. **Approve existing teacher accounts before rollout.** Use trusted server-issued
   claims and refresh staff tokens. This branch did not modify authentication data.
3. **Parent-mobile entry is self-identification.** Ownership and anonymous roster
   read limits cannot be proved by this flow. Review direct full-document student
   lookup and use a limited-field backend lookup before a broader privacy rollout.
   Waiting Room admission and teacher verification remain necessary.
4. **Webhook latency/delivery needs a real test.** The synchronous endpoint performs
   database transactions and history queries. Measure it against Zoom's three-second
   acknowledgement requirement with 40-45 participants. Consider a durable intake
   and asynchronous projection if latency exceeds that target. No load-test claim
   is made from the in-memory concurrency tests.
5. **An ambiguous Zoom create is not fully compensated.** If Zoom creates a meeting
   but the subsequent Firestore save fails or its class revision changes, an orphan
   Zoom meeting can remain. Check the host's Zoom schedule before repeating such
   a failed creation. A later recovery mechanism can improve this boundary.
6. **Timetable conflicts remain advisory.** Simultaneous teachers can race the
   client conflict query, and deliberate overlaps are still allowed as before.
   Server reservation/locking is an optional future enhancement.
7. **Shared Zoom hosts have account limits.** Separate teacher credentials and
   owner checks are retained; simultaneously hosting multiple meetings on the same
   Zoom account is subject to that account's plan. No paid host feature was added.
8. **Six moderate dependency advisories remain upstream.** Monitor supported Google
   dependency releases and re-run the audit before rollout. External CDN assets and
   GitHub Actions references are not covered by npm's package scan. The Firebase
   deployment CLI is pinned to 15.34.2 (Node.js 22 supported).

## Deployment requirements and review boundary

Keep the existing Firebase/Firestore rules unchanged. Read the current setup
documentation and verify teacher claims, the four Zoom secrets, event
subscription/scopes, OAuth redirect and GitHub deployment identity.
Test two teacher accounts and a synthetic roster, including sibling selection,
two devices for one student, disconnection, missing exit, delayed events, early end,
manual override and PDF download. Keep automatic absence Pending when verification
is unavailable.

The repository's default `functions/` source is missing even though firebase.json
references it. Never run a blanket Firebase Functions deployment from this checkout.
The existing workflows deploy on `main`; **merging this branch can deploy production**.
Do not merge or dispatch deployments until the owner approves the reviewed rollout
and its prerequisites are complete. The draft branch/PR runs validation only.

## Optional enhancements, not required for these fixes

Server timetable reservations, limited-field/rate-limited student lookup, automatic
orphan-meeting recovery, durable webhook intake, monitoring, and deduplication of
shared page helpers are separate changes. Consolidating the entire school frontend
or replacing the existing quiz/other applications is outside this branch's scope.

## Primary references

- https://developers.zoom.us/docs/api/webhooks/ — signatures, delivery retries and acknowledgement timing.
- https://developers.zoom.us/docs/api/meetings/ — past-participant API plan prerequisites.
- https://marketplacefront.zoom.us/sdk/meeting/web/functions/ZoomMtg.inMeetingServiceListener.html — connection status events.
- https://firebase.google.com/docs/firestore/manage-data/transactions — atomic operations and retries.
- https://firebase.google.com/docs/firestore/security/rules-structure — overlapping rule behaviour.
- https://firebase.google.com/docs/auth/admin/custom-claims — server-controlled teacher authorization.
