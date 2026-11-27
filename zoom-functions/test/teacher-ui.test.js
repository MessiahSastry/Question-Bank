'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../../online-class-teacher.html'), 'utf8');
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const now = Date.now(), start = now - 45 * 60000, end = start + 40 * 60000;
function fixture({confirmed = false, serverVerified = true} = {}) {
  const state = {attendance: {serverVerified, changes: new Map()}};
  const m = {teacherId: 'teacher', status: 'scheduled', startAt: new Date(start), endAt: new Date(end),
    durationMinutes: 40, zoomActualStartedAt: new Date(start), zoomActualEndedAt: new Date(end),
    zoomMeetingUuid: 'instance', zoomAttendanceRevision: 2};
  if (confirmed) Object.assign(m, {zoomAttendanceConfirmedBy: 'teacher', zoomAttendanceConfirmedUuid: 'instance',
    zoomAttendanceConfirmedRevision: 2, zoomAttendanceConfirmedAt: new Date(end + 120000),
    zoomAttendanceConfirmedStartMs: start, zoomAttendanceConfirmedEndMs: end});
  const context = vm.createContext({state, Date});
  vm.runInContext(section('  function ms(', '  function formatDateTime(') +
    section('  function durationOf(', '  function sessionStatus(') +
    section('  function attendanceFingerprint(', '  function attendanceNotice('), context);
  const row = {id: 'student', status: '', record: {zoomSource: 'signed_zoom_webhook', zoomIntervals: []}};
  const interval = (from, to) => ({joinedAt: new Date(from).toISOString(),
    leftAt: to == null ? null : new Date(to).toISOString(), meetingUuid: 'instance'});
  return {state, m, row, interval, result: () => context.zoomAttendance(m, row)};
}
test('no join is 0 minutes and Pending until final attendance is confirmed', () => {
  const f = fixture(); assert.equal(f.result().auto, 'pending'); assert.equal(f.result().durationText, '0 min / 40 min');
});
test('no join is 0 minutes and Absent after reliable teacher confirmation', () => {
  const f = fixture({confirmed: true}); assert.equal(f.result().auto, 'absent'); assert.equal(f.result().durationText, '0 min / 40 min');
});
test('33 verified minutes passes a 40-minute class with seven-minute allowance', () => {
  const f = fixture(); f.row.record.zoomIntervals = [f.interval(start + 7 * 60000, end)];
  assert.equal(f.result().auto, 'present');
});
test('32m 59s does not round up to the pass mark', () => {
  const f = fixture({confirmed: true}); f.row.record.zoomIntervals = [f.interval(start + 7 * 60000 + 1000, end)];
  assert.equal(f.result().auto, 'absent'); assert.equal(f.result().durationText, '32m 59s / 40 min');
});
test('overlapping devices, duplicates and out-of-window time are not counted twice', () => {
  const f = fixture(); f.row.record.zoomIntervals = [f.interval(start - 600000, start + 30 * 60000),
    f.interval(start + 10 * 60000, end + 600000), f.interval(start + 10 * 60000, end + 600000)];
  assert.equal(f.result().spent, 40 * 60000); assert.equal(f.result().auto, 'present');
});
test('reconnect gaps count towards missed time', () => {
  const f = fixture({confirmed: true}); f.row.record.zoomIntervals = [f.interval(start, start + 10 * 60000),
    f.interval(start + 18 * 60000, end)];
  assert.equal(f.result().spent, 32 * 60000); assert.equal(f.result().auto, 'absent');
});
for (const issue of ['missing-exit', 'unmatched-exit', 'truncated', 'malformed', 'unsigned', 'wrong-instance', 'meeting-issue']) {
  test('integrity problem remains Unverified: ' + issue, () => {
    const f = fixture({confirmed: true}); f.row.record.zoomIntervals = [f.interval(start, end)];
    if (issue === 'missing-exit') f.row.record.zoomIntervals[0].leftAt = null;
    if (issue === 'unmatched-exit') f.row.record.zoomUnmatchedExits = 1;
    if (issue === 'truncated') f.row.record.zoomIntervalsTruncated = true;
    if (issue === 'malformed') f.row.record.zoomIntervals.push(null);
    if (issue === 'unsigned') f.row.record.zoomSource = 'browser';
    if (issue === 'wrong-instance') f.row.record.zoomIntervals[0].meetingUuid = 'another';
    if (issue === 'meeting-issue') f.m.zoomAttendanceIssue = 'multiple_meeting_instances';
    assert.equal(f.result().auto, 'unverified');
  });
}
test('new Zoom evidence invalidates a prior final-absence confirmation', () => {
  const f = fixture({confirmed: true}); f.m.zoomAttendanceRevision++; assert.equal(f.result().auto, 'pending');
});
test('changed actual meeting boundaries invalidate confirmation', () => {
  const f = fixture({confirmed: true}); f.m.zoomActualStartedAt = new Date(start - 60000); assert.equal(f.result().auto, 'pending');
});
test('an unverified read can never mark automatic absence or presence', () => {
  const f = fixture({confirmed: true, serverVerified: false}); assert.equal(f.result().auto, 'pending');
  f.row.record.zoomIntervals = [f.interval(start, end)]; assert.equal(f.result().auto, 'pending');
});
test('a short class still requires a positive amount of verified attendance', () => {
  const f = fixture({confirmed: true});
  f.m.zoomActualEndedAt = new Date(start + 5 * 60000);
  f.m.zoomAttendanceConfirmedEndMs = start + 5 * 60000;
  assert.equal(f.result().auto, 'absent');
  f.row.record.zoomIntervals = [f.interval(start, start + 1000)]; assert.equal(f.result().auto, 'present');
});
test('saved teacher overrides, unsaved overrides and switching back to Automatic are preserved', () => {
  const f = fixture(); f.row.status = 'present'; assert.equal(f.result().final, 'present');
  f.state.attendance.changes.set('student', 'absent'); assert.equal(f.result().final, 'absent');
  f.state.attendance.changes.set('student', ''); assert.equal(f.result().final, 'pending');
});
test('meeting start/end and the settlement interval are required', () => {
  const f = fixture({confirmed: true});
  delete f.m.zoomActualStartedAt; assert.equal(f.result().auto, 'pending');
  f.m.zoomActualStartedAt = new Date(start); f.m.zoomActualEndedAt = new Date(Date.now() - 60000);
  assert.equal(f.result().auto, 'pending');
});
test('a cancelled class never produces automatic absence', () => {
  const f = fixture({confirmed: true}); f.m.status = 'cancelled'; assert.equal(f.result().auto, 'pending');
});
