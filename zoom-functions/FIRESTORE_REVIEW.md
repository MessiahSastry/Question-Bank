# Existing Firestore rules remain unchanged

The owner has instructed that the existing Firebase/Firestore rules must remain
unchanged. This work does not request an export, replacement or deployment of
rules. No existing rules or production data have been changed.

The live rules were not inspected and are absent from this repository. This
file records the access boundaries considered during the audit; it is not a
deployable ruleset, a rollout requirement or an instruction to modify permissions.
Backend authorization checks apply to the service endpoints, but cannot establish
that direct browser database access is restricted by the existing rules.

## Informational access matrix

| Path or field group | Boundary described by the audit |
| --- | --- |
| `zoomTeacherCredentials/{uid}` | No browser reads or writes. Only trusted server SDKs may access encrypted tokens or refresh locks. |
| `zoomOAuthPending/{stateHash}` | No browser reads or writes. Server owns signed one-use OAuth state. |
| `meetings/{id}/zoomStudentCodes/{tag}` | Server only; clients must not forge attendance-tag mappings. |
| `meetings/{id}/zoomParticipantBindings/{key}` | Server only; clients must not reassign a Zoom participant to another student. |
| `meetings/{id}/zoomAttendanceEvents/{eventId}` | Server only; clients must not create, modify or delete verified evidence. |
| Meeting creation and schedule edits | Reuse the existing CampusConnect sign-in and permission model; retain `teacherId == request.auth.uid`, valid fields and revision checks for this online-class implementation. No new custom claims or per-teacher approval are required. Existing administrator permissions in other modules are unchanged. |
| Zoom credentials, provisioning locks, IDs/passcodes, actual start/end/UUID, attendance revision and issue fields on meeting documents | Server-owned. Normal client schedule writes must not change or delete these fields. |
| Attendance reads | Existing owning teacher under the current permission model only. Student browsers must not list attendance. |
| Attendance client writes | Approved owner teacher only, and only the existing manual override fields: studentId, studentName, academicYear, status, confirmedBy, confirmedAt. Require confirmedBy == request.auth.uid and server request time. Never allow a client to alter zoomIntervals, zoomSource or any other evidence field. |
| Final-attendance confirmation fields on a meeting | Approved owner teacher only; confirmedBy must be the authenticated UID, confirmedAt must equal request.time, UUID/revision/start/end must match the current server evidence, and actual end plus two minutes must have passed. |
| `participants/{studentId}` | Join-click telemetry only, with an explicit field allowlist. No permission to alter attendance evidence or teacher overrides. It is not proof of identity or presence. |
| School roster | Approved staff access to full records. Review anonymous reads against the current student lookup requirements below. |

## Student lookup limitation

The current student frontend directly queries matching full student documents by
the entered parent mobile number and can use anonymous Firebase sessions. The SDK
backend independently validates the selected student and number, while phone
ownership and the live rules' permission boundaries remain unverified.

The existing parent-mobile login, quiz access and Firebase rules are preserved.
No Child ID or OTP is introduced. Zoom Waiting Room admission and teacher review
remain part of the existing flow. Future changes to lookup or database permissions
are outside this work and would require a separate request.

## Verification limits

The offline application tests validate backend and page behaviour. They do not
validate deployed rules or prove that browser clients cannot bypass page controls.
No claim that existing rule protections were verified is made.
