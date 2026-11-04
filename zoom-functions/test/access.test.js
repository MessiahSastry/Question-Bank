'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Timestamp, loadBackend, response} = require('./helpers');

for (const [label, decoded, expected] of [
  ['approved teacher', {uid: 'teacher', email: 'teacher@example.invalid', schoolTeacher: true}, 'teacher'],
  ['school administrator', {uid: 'admin', email: 'admin@example.invalid', schoolAdmin: true}, 'admin'],
  ['self-registered email', {uid: 'new', email: 'new@example.invalid'}, null],
  ['anonymous account', {uid: 'anon', email: 'anon@example.invalid', schoolTeacher: true, firebase: {sign_in_provider: 'anonymous'}}, null],
  ['missing email', {uid: 'teacher', schoolTeacher: true}, null],
  ['string claim', {uid: 'teacher', email: 'teacher@example.invalid', schoolTeacher: 'true'}, null]
]) {
  test('teacher authorization: ' + label, async () => {
    const {exports} = loadBackend('auth.js', {decoded});
    assert.equal(await exports.teacherUid({headers: {authorization: 'Bearer token'}}), expected);
  });
}
test('OAuth form tokens are accepted only by the explicit OAuth form route', async () => {
  const {exports} = loadBackend('auth.js', {decoded: {uid: 'teacher', email: 'teacher@example.invalid', schoolTeacher: true}});
  const req = {headers: {}, is: () => true, body: {firebaseIdToken: 'token'}};
  assert.equal(await exports.teacherUid(req), null);
  assert.equal(await exports.teacherUid(req, {allowForm: true}), 'teacher');
});
test('OAuth callback approval check rejects disabled and unapproved accounts', async () => {
  for (const user of [{uid: 'teacher', email: 'teacher@example.invalid', disabled: true, customClaims: {schoolTeacher: true}},
    {uid: 'teacher', email: 'teacher@example.invalid', customClaims: {}}]) {
    const {exports} = loadBackend('auth.js', {getUser: async () => user});
    assert.equal(await exports.teacherStillApproved('teacher'), false);
  }
});
function sdkFixture(overrides = {}, studentOverrides = {}) {
  const {exports, db} = loadBackend('sdk.js', {decoded: {uid: 'student-session', firebase: {sign_in_provider: 'anonymous'}}});
  const start = Date.now() - 60000;
  db.data.set('meetings/class-test', {status: 'scheduled', startAt: Timestamp.fromMillis(start),
    endAt: Timestamp.fromMillis(start + 40 * 60000), durationMinutes: 40,
    revision: 1, zoomProvisionedRevision: 1, zoomMeetingId: '12345678901', zoomPasscode: 'passcode',
    academicYear: '2026-27', classId: 'class', sectionId: 'section', ...overrides});
  db.data.set('years/2026-27/classes/class/sections/section/students/student',
    {name: 'Student', roll: '7', parentPhone: '+91 98765 43210', ...studentOverrides});
  const req = {method: 'POST', headers: {origin: 'https://stpatricks-questionbank.web.app', authorization: 'Bearer token'},
    is: () => true, body: {meetingId: 'class-test', studentId: 'student', parentPhone: '9876543210'}};
  return {db, req, send: async () => {const res = response(); await exports.zoomSdkParticipantSignature(req, res); return res;}};
}
test('registered parent mobile authorizes an anonymous student session with participant-only signature', async () => {
  const f = sdkFixture(), res = await f.send(); assert.equal(res.statusCode, 200);
  const payload = JSON.parse(Buffer.from(res.body.signature.split('.')[1], 'base64url'));
  assert.equal(payload.role, 0); assert.equal(payload.mn, '12345678901');
  assert.match(res.body.userName, /\[SP-[A-Za-z0-9_-]{12}\]$/);
  assert.equal([...f.db.data.keys()].filter(key => key.includes('/zoomStudentCodes/')).length, 1);
});
for (const [label, overrides, expected] of [
  ['cancelled', {status: 'cancelled'}, 'WINDOW'],
  ['already ended in Zoom', {zoomActualEndedAt: Timestamp.fromMillis(Date.now() - 5000)}, 'WINDOW'],
  ['outside joining window', {startAt: Timestamp.fromMillis(Date.now() + 60 * 60000), endAt: Timestamp.fromMillis(Date.now() + 100 * 60000)}, 'WINDOW'],
  ['stale meeting revision', {revision: 2}, 'MEETING'],
  ['invalid year', {academicYear: '2026-28'}, 'SECTION'],
  ['invalid section path', {sectionId: '../other'}, 'SECTION'],
  ['reversed meeting window', {endAt: Timestamp.fromMillis(Date.now() - 5 * 60000)}, 'WINDOW']
]) {
  test('student SDK rejects ' + label, async () => {
    const f = sdkFixture(overrides), res = await f.send(); assert.equal(res.body.error, expected);
    assert.equal([...f.db.data.keys()].filter(key => key.includes('/zoomStudentCodes/')).length, 0);
  });
}
test('student SDK rejects a different parent number, another section student and an untrusted origin', async () => {
  const wrongPhone = sdkFixture(); wrongPhone.req.body.parentPhone = '1234567890';
  assert.equal((await wrongPhone.send()).body.error, 'STUDENT');
  const absent = sdkFixture(); absent.req.body.studentId = 'someone-else'; assert.equal((await absent.send()).body.error, 'STUDENT');
  const origin = sdkFixture(); origin.req.headers.origin = 'https://example.invalid'; assert.equal((await origin.send()).body.error, 'ORIGIN');
});
test('a stale token snapshot cannot spend a rotated Zoom refresh token', async () => {
  let requests = 0;
  const {exports, db} = loadBackend('meetings.js', {
    fetch: async () => {requests++; throw new Error('No refresh should be needed');},
    expose: '\nexports.testOnly = {seal, refreshToken};'});
  db.data.set('zoomTeacherCredentials/teacher', {status: 'connected',
    encryptedTokens: exports.testOnly.seal({access_token: 'fresh', refresh_token: 'rotated'}),
    accessExpiresAt: Timestamp.fromMillis(Date.now() + 3600000)});
  const tokens = await exports.testOnly.refreshToken('teacher', {refresh_token: 'stale'});
  assert.equal(tokens.access_token, 'fresh'); assert.equal(requests, 0);
});
test('a refresh lock prevents concurrent spending and successful refresh rotates tokens once', async () => {
  let requests = 0;
  const {exports, db} = loadBackend('meetings.js', {
    fetch: async (_url, options) => {requests++; assert.match(options.body, /refresh_token=current/);
      return {ok: true, json: async () => ({access_token: 'fresh', refresh_token: 'next', expires_in: 3600})};},
    expose: '\nexports.testOnly = {seal, refreshToken};'});
  db.data.set('zoomTeacherCredentials/teacher', {status: 'connected',
    encryptedTokens: exports.testOnly.seal({access_token: 'old', refresh_token: 'current'}),
    accessExpiresAt: Timestamp.fromMillis(Date.now() - 1000)});
  const results = await Promise.allSettled([exports.testOnly.refreshToken('teacher'), exports.testOnly.refreshToken('teacher')]);
  assert.equal(requests, 1); assert.ok(results.some(result => result.status === 'fulfilled'));
  assert.equal(db.data.get('zoomTeacherCredentials/teacher').refreshLock, undefined);
});
