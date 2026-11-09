# Teacher Performance: Firestore security setup

The Teachers' Performance Graph page lives at `teacher-performance.html`.
All signed-in staff can view aggregate teacher performance, but **only**
`messiah.sastry@stpatricksschool.com` may add or change teacher records or
allotments.

## Collections used

- `performanceTeachers/{teacherId}` — teacher names created by the admin.
- `years/{yearId}/teacherAssignments/{assignmentId}` — class, section and
  subject assignments (references to existing classes, sections and subjects).
- Existing school `years`, `classes`, `sections`, `exams`, `students`
  and `marks` paths — read only, using the existing school app rules.

## Security rules to merge into the **currently deployed** Firestore rules

Add these within the existing `service cloud.firestore { match /databases/{database}/documents { ... } }`
scope; **do not replace the rest of the school's rules with only this snippet.**

```firestore-rules
function isTeacherPerformanceAdmin() {
  return request.auth != null &&
         request.auth.token.email == 'messiah.sastry@stpatricksschool.com';
}
match /performanceTeachers/{teacherId} {
  allow read: if request.auth != null;
  allow create, update, delete: if isTeacherPerformanceAdmin();
}
match /years/{yearId}/teacherAssignments/{assignmentId} {
  allow read: if request.auth != null;
  allow create, update, delete: if isTeacherPerformanceAdmin();
}
```

**CRITICAL:** Firestore permissions are ORed across matching allow rules.
If the deployed rules currently contain a broad wildcard rule such as
`allow write: if request.auth != null` matching either collection, adding
the restrictions above **does not** deny those writes. Remove or narrow the
overlapping broad write permission in the existing rules, while preserving
access required by the rest of the app.

This file is **documentation only**. Committing it to GitHub does not deploy
Firestore Security Rules. Deploy the carefully merged rules through
Firebase Console or your established Firestore rules deployment process.
Until that is done, the UI's email check hides admin controls but **does not
guarantee write protection against direct Firestore access**.

## Exam completion fallback

The existing exam creation code does not consistently store a finalization
flag. This page accepts an exam if its Firestore metadata positively marks it
completed/finalized/published, or if every active student in that assigned
section has an explicit valid mark (including 0) or an explicit AB for the
teacher's subject. Unentered and incomplete subtopic scores are not counted
as completed. An explicit draft/pending status excludes the exam.

For future use, marking exam definitions as `status: 'completed'` after
checking results will make this process deterministic.

## Deployment notes

The root `teacher-performance.html` page is intended for the existing
GitHub Pages site, linked from `students.html`. The `firebase.json`
hosting target is **firebase-site/** rather than the repository root; this
commit does not deploy the new page to that separate Firebase Hosting target.
