'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {Timestamp, loadBackend, response, signedRequest} = require('./helpers');
const {reconcileEvents} = require('../attendance-model');

const code = 'abcdefghijkl';
const id = 'class-test-123';
const start = Date.now() - 45 * 60000, end = start + 40 * 60000;
function fixture() {
  const {exports, db} = loadBackend('attendance.js');
  db.data.set('meetings/' + id, {teacherId: 'teacher', status: 'scheduled', zoomMeetingId: '12345678901'});
  db.data.set('meetings/' + id + '/zoomStudentCodes/' + code, {studentId: 'student'});
  const event = (kind, at, {name = 'Student [SP-' + code + ']', user = '9', uuid = 'instance-1'} = {}) => ({
    event: kind.startsWith('meeting.') ? kind : 'meeting.participant_' + kind,
    event_ts: at, payload: {object: {id: '12345678901', uuid,
      start_time: new Date(at).toISOString(), end_time: new Date(at).toISOString(),
      participant: {user_id: user, user_name: name,
        join_time: new Date(at).toISOString(), leave_time: new Date(at).toISOString()}}}});
  async function send(body) {
    const res = response(); await exports.zoomAttendanceWebhook(signedRequest(body), res); return res;
  }
  return {db, event, send, handler: exports.zoomAttendanceWebhook,
    record: () => db.data.get('meetings/' + id + '/attendance/student'),
    events: () => [...db.data].filter(([key]) => key.includes('/zoomAttendanceEvents/'))};
}
test('signed student entry and exit create one verified interval', async () => {
  const f = fixture();
  assert.equal((await f.send(f.event('joined', start))).statusCode, 204);
  await f.send(f.event('left', end));
  assert.equal(f.record().zoomIntervals.length, 1);
  assert.equal(Date.parse(f.record().zoomIntervals[0].leftAt) - Date.parse(f.record().zoomIntervals[0].joinedAt), 40 * 60000);
  assert.equal(f.record().zoomSource, 'signed_zoom_webhook');
});
test('exit delivered before an identifying join is retained and reconciled', async () => {
  const f = fixture();
  await f.send(f.event('left', end, {name: 'Renamed student'}));
  assert.equal(f.events().length, 1);
  assert.equal(f.record(), undefined);
  await f.send(f.event('joined', start));
  assert.equal(f.record().zoomUnmatchedExits, 0);
  assert.equal(f.record().zoomIntervals[0].leftAt, new Date(end).toISOString());
});
test('failed projection commit does not leave a half-saved event; retry heals it', async () => {
  const f = fixture();
  f.db.failNextCommit = writes => writes.some(write => write.ref.path.includes('/attendance/'));
  assert.equal((await f.send(f.event('joined', start))).statusCode, 500);
  assert.equal(f.events().length, 0);
  assert.equal((await f.send(f.event('joined', start))).statusCode, 204);
  assert.equal(f.record().zoomIntervals.length, 1);
});
test('retry repairs a legacy event persisted before its projection failed', async () => {
  const f = fixture();
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const key = hash(['join', 'instance-1', '9', start, code].join('|'));
  f.db.data.set('meetings/' + id + '/zoomAttendanceEvents/' + key,
    {studentId: 'student', kind: 'join', atMs: start,
      instanceKey: hash('instance-1|9'), meetingUuid: 'instance-1'});
  await f.send(f.event('joined', start));
  assert.equal(f.record().zoomIntervals.length, 1);
});
test('duplicate delivery with changed display name does not duplicate event or invalidate confirmation', async () => {
  const f = fixture();
  await f.send(f.event('joined', start));
  const before = f.db.data.get('meetings/' + id).zoomAttendanceRevision;
  await f.send(f.event('joined', start, {name: 'Renamed student'}));
  assert.equal(f.events().length, 1);
  assert.equal(f.record().zoomIntervals.length, 1);
  assert.equal(f.db.data.get('meetings/' + id).zoomAttendanceRevision, before);
});
test('concurrent joins and exits preserve both connections and teacher override', async () => {
  const f = fixture();
  f.db.data.set('meetings/' + id + '/attendance/student', {status: 'absent', confirmedBy: 'teacher'});
  await Promise.all([f.send(f.event('joined', start, {user: 'a'})),
    f.send(f.event('joined', start + 60000, {user: 'b'})),
    f.send(f.event('left', end, {user: 'a'})), f.send(f.event('left', end, {user: 'b'}))]);
  assert.equal(f.record().zoomIntervals.length, 2);
  assert.equal(f.record().status, 'absent');
  assert.equal(f.record().confirmedBy, 'teacher');
});
test('new participant evidence advances the confirmation revision', async () => {
  const f = fixture();
  await f.send(f.event('joined', start));
  const before = f.db.data.get('meetings/' + id).zoomAttendanceRevision;
  await f.send(f.event('left', end));
  assert.equal(f.db.data.get('meetings/' + id).zoomAttendanceRevision, before + 1);
});
test('a reused meeting number never stretches one session across two UUIDs', async () => {
  const f = fixture();
  await f.send(f.event('meeting.started', start));
  await f.send(f.event('meeting.ended', end));
  await f.send(f.event('meeting.started', end + 600000, {uuid: 'instance-2'}));
  const m = f.db.data.get('meetings/' + id);
  assert.equal(m.zoomAttendanceIssue, 'multiple_meeting_instances');
  assert.equal(m.zoomActualStartedAt.toMillis(), start);
  assert.equal(m.zoomActualEndedAt.toMillis(), end);
});
test('reordered meeting boundary events preserve earliest start and latest end for one UUID', async () => {
  const f = fixture();
  await f.send(f.event('meeting.ended', end));
  await f.send(f.event('meeting.started', start + 1000));
  await f.send(f.event('meeting.started', start));
  await f.send(f.event('meeting.ended', end - 1000));
  const m = f.db.data.get('meetings/' + id);
  assert.equal(m.zoomActualStartedAt.toMillis(), start);
  assert.equal(m.zoomActualEndedAt.toMillis(), end);
});
for (const mutation of ['signature', 'body', 'timestamp']) {
  test('rejects tampered webhook ' + mutation, async () => {
    const f = fixture(), req = signedRequest(f.event('joined', start)), res = response();
    if (mutation === 'signature') req.headers['x-zm-signature'] = 'v0=' + '0'.repeat(64);
    if (mutation === 'body') req.rawBody = Buffer.from('{}');
    if (mutation === 'timestamp') req.headers['x-zm-request-timestamp'] = String(Math.floor(Date.now()/1000) - 601);
    await f.handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(f.events().length, 0);
  });
}
test('endpoint validation returns the expected HMAC challenge response without database writes', async () => {
  const f = fixture(), res = await f.send({event: 'endpoint.url_validation', payload: {plainToken: 'challenge'}});
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.encryptedToken, crypto.createHmac('sha256', 'test-secret').update('challenge').digest('hex'));
  assert.equal(f.events().length, 0);
});
test('unknown, cancelled and ambiguous school meeting IDs produce no attendance', async () => {
  for (const mode of ['unknown', 'cancelled', 'ambiguous']) {
    const f = fixture();
    if (mode === 'unknown') f.db.data.delete('meetings/' + id);
    if (mode === 'cancelled') f.db.data.get('meetings/' + id).status = 'cancelled';
    if (mode === 'ambiguous') f.db.data.set('meetings/duplicate', {zoomMeetingId: '12345678901'});
    await f.send(f.event('joined', start)); assert.equal(f.events().length, 0);
  }
});
test('invalid timestamps and missing instance UUID are ignored', async () => {
  const f = fixture(), body = f.event('joined', start, {uuid: ''});
  await f.send(body);
  const invalid = f.event('joined', start);
  invalid.payload.object.participant.join_time = 'invalid'; invalid.event_ts = 0;
  await f.send(invalid); assert.equal(f.events().length, 0);
});
test('unmatched exits and truncated history remain explicit integrity problems', () => {
  const orphan = reconcileEvents([{kind: 'leave', atMs: end, instanceKey: 'x'}]);
  assert.equal(orphan.zoomUnmatchedExits, 1);
  const events = Array.from({length: 201}, (_, i) => [
    {kind: 'join', atMs: start + i * 2000, instanceKey: String(i)},
    {kind: 'leave', atMs: start + i * 2000 + 1000, instanceKey: String(i)}]).flat();
  const result = reconcileEvents(events);
  assert.equal(result.zoomIntervals.length, 200); assert.equal(result.zoomIntervalsTruncated, true);
});
