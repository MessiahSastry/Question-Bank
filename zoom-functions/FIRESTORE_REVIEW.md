# Firestore review required before rollout

The deployed Firestore rules are not present in this repository and were not
retrieved during this audit. No rules or production data were changed. This
document is a review specification, not a deployable replacement ruleset.

Export the actual deployed rules into version control, retain the unrelated
applications' behaviour, and test the merged rules with the Firestore emulator
before owner-approved deployment. A narrow deny does **not** override a broader
allow: every matching rule must be reviewed.

## Required access boundaries

| Path or field group | Required boundary |
| --- | --- |
| `zoomTeacherCredentials/{uid}` | No browser reads or writes. Only trusted server SDKs may access encrypted tokens or refresh locks. |
| `zoomOAuthPending/{stateHash}` | No browser reads or writes. Server owns signed one-use OAuth state. |
| `meetings/{id}/zoomStudentCodes/{tag}` | Server only; clients must not forge attendance-tag mappings. |
| `meetings/{id}/zoomParticipantBindings/{key}` | Server only; clients must not reassign a Zoom participant to another student. |
| `meetings/{id}/zoomAttendanceEvents/{eventId}` | Server only; clients must not create, modify or delete verified evidence. |
| Meeting creation and schedule edits | Require a server-issued schoolTeacher/schoolAdmin claim, `teacherId == request.auth.uid`, valid fields and monotonically increasing revision. Owner cannot be changed. This implementation manages only the signed-in teacher's own meetings. |
| Zoom credentials, provisioning locks, IDs/passcodes, actual start/end/UUID, attendance revision and issue fields on meeting documents | Server-owned. Normal client schedule writes must not change or delete these fields. |
| Attendance reads | Approved owner teacher only. Student browsers must not list attendance. |
| Attendance client writes | Approved owner teacher only, and only the existing manual override fields: studentId, studentName, academicYear, status, confirmedBy, confirmedAt. Require confirmedBy == request.auth.uid and server request time. Never allow a client to alter zoomIntervals, zoomSource or any other evidence field. |
| Final-attendance confirmation fields on a meeting | Approved owner teacher only; confirmedBy must be the authenticated UID, confirmedAt must equal request.time, UUID/revision/start/end must match the current server evidence, and actual end plus two minutes must have passed. |
| `participants/{studentId}` | Join-click telemetry only, with an explicit field allowlist. No permission to alter attendance evidence or teacher overrides. It is not proof of identity or presence. |
| School roster | Approved staff access to full records. Review anonymous reads against the current student lookup requirements below. |

## Student lookup limitation

The current online-class frontend resolves its class/section and directly reads
matching full student documents by the entered parentPhone. It can use anonymous
Firebase sessions. The SDK backend independently validates the selected roster
student and parent number, but this does not prove ownership of that phone.

The exact permissions currently granted to anonymous clients remain unverified.
Do not claim that the UI's query filter prevents a different query, or that a
Firebase API key is a security boundary. For stronger data minimization, move
lookup to a rate-limited backend returning only the necessary student IDs,
names and rolls, and remove direct anonymous access to full roster records.
Review the quiz's existing lookup dependencies before changing shared roster
permissions. This branch intentionally does not alter the quiz system.

Child ID and OTP have not been introduced. Zoom Waiting Room admission remains
necessary; parent-mobile self-identification and a display-name attendance tag
are not strong identity authentication. Participant-only SDK signatures do not
confer teacher access.

## Required rule tests once the real source is available

Test unauthenticated, anonymous, self-registered email, approved teacher, another
teacher, and administrator sessions. Verify private collections are denied to
all browser roles; only an approved owner may edit schedules/overrides/confirmation;
server fields cannot be forged or deleted; lookup exposes no unrelated roster
data; and the existing quiz/other school applications retain their authorised
behaviour. The current offline application tests do not validate deployed rules.

References:
- https://firebase.google.com/docs/firestore/security/rules-structure
- https://firebase.google.com/docs/firestore/security/rules-query
- https://firebase.google.com/docs/auth/admin/custom-claims
