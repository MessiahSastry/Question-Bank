'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Timestamp, loadBackend, response} = require('./helpers');

const teacher = {uid: 'teacher', email: 'teacher@example.invalid'};
function meetingFixture({decoded = teacher, scopes = 'meeting:write:meeting meeting:update:meeting', overrides = {}, changeDuringRequest = false} = {}) {
  const requests = [];
  const {exports, db} = loadBackend('meetings.js', {decoded,
    fetch: async (url, options) => {
      requests.push({url, method: options.method});
      if (changeDuringRequest) db.data.get('meetings/class-test-123').revision++;
      return {ok: true, json: async () => ({id: '12345678901', join_url: 'https://zoom.us/j/12345678901?pwd=test', password: 'test'})};
    }, expose: '\nexports.testOnly = {seal};'});
  db.data.set('zoomTeacherCredentials/teacher', {status: 'connected',
    encryptedTokens: exports.testOnly.seal({access_token: 'access', refresh_token: 'refresh', scope: scopes}),
    accessExpiresAt: Timestamp.fromMillis(Date.now() + 3600000)});
  db.data.set('meetings/class-test-123', {teacherId: 'teacher', status: 'scheduled',
    startAt: Timestamp.fromMillis(Date.now() + 3600000), durationMinutes: 40,
    class: '6th Class', section: 'Greenhouse', subject: 'English', topic: 'Test topic', revision: 1, ...overrides});
  const req = {method: 'POST', headers: {authorization: 'Bearer token', origin: 'https://messiahsastry.github.io'},
    body: {meetingId: 'class-test-123'}};
  return {db, req, requests, send: async () => {const res = response(); await exports.zoomCreateMeeting(req, res); return res;}};
}
test('teacher schedules a secured meeting and a retry reuses the same Zoom meeting', async () => {
  const f = meetingFixture(); const first = await f.send();
  assert.equal(first.statusCode, 200); assert.equal(f.requests.length, 1);
  const saved = f.db.data.get('meetings/class-test-123');
  assert.equal(saved.zoomMeetingId, '12345678901'); assert.equal(saved.zoomPasscode, 'test');
  assert.equal(saved.zoomProvisionedRevision, 1); assert.equal(saved.zoomProvisioning, undefined);
  assert.equal((await f.send()).body.alreadyReady, true); assert.equal(f.requests.length, 1);
});
test('one teacher cannot generate another teacher’s meeting', async () => {
  const f = meetingFixture({decoded: {...teacher, uid: 'other-teacher'}});
  assert.equal((await f.send()).statusCode, 403); assert.equal(f.requests.length, 0);
});
test('anonymous student sessions cannot call the teacher meeting API', async () => {
  const f = meetingFixture({decoded: {uid: 'teacher', email: 'teacher@example.invalid', firebase: {sign_in_provider: 'anonymous'}}});
  assert.equal((await f.send()).statusCode, 401); assert.equal(f.requests.length, 0);
});
test('concurrent requests create only one Zoom meeting', async () => {
  const f = meetingFixture(); const responses = await Promise.all([f.send(), f.send()]);
  assert.equal(f.requests.length, 1); assert.ok(responses.some(res => res.statusCode === 200));
  assert.ok(responses.some(res => res.statusCode === 409 || res.body.alreadyReady));
});
test('rescheduling updates the existing meeting and preserves its passcode', async () => {
  const f = meetingFixture({overrides: {zoomMeetingId: '12345678901', zoomJoinUrl: 'https://zoom.us/j/12345678901',
    zoomPasscode: 'existing', zoomProvisionedRevision: 1, revision: 2}});
  assert.equal((await f.send()).statusCode, 200); assert.equal(f.requests[0].method, 'PATCH');
  assert.equal(f.db.data.get('meetings/class-test-123').zoomPasscode, 'existing');
  assert.equal(f.db.data.get('meetings/class-test-123').zoomProvisionedRevision, 2);
});
test('a revision change while Zoom is processing cannot overwrite the newer class', async () => {
  const f = meetingFixture({changeDuringRequest: true});
  assert.equal((await f.send()).body.error, 'CLASS_CHANGED');
  const saved = f.db.data.get('meetings/class-test-123');
  assert.equal(saved.revision, 2); assert.equal(saved.zoomMeetingId, undefined); assert.equal(saved.zoomProvisioning, undefined);
});
test('missing scopes, cancelled classes and invalid durations stop before a Zoom API call', async () => {
  for (const options of [{scopes: ''}, {overrides: {status: 'cancelled'}}, {overrides: {durationMinutes: 300}}]) {
    const f = meetingFixture(options), res = await f.send(); assert.ok(res.statusCode >= 400); assert.equal(f.requests.length, 0);
  }
});

function oauthFixture({active = true} = {}) {
  let tokenRequests = 0;
  const {exports, db} = loadBackend('index.js', {decoded: teacher,
    getUser: async uid => ({uid, email: 'teacher@example.invalid', disabled: !active}),
    fetch: async () => {tokenRequests++; return {ok: true, status: 200,
      json: async () => ({access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 3600})};}});
  const req = {method: 'POST', headers: {authorization: 'Bearer token', origin: 'https://stpatricks-questionbank.web.app'},
    is: () => false, body: {}};
  const start = async () => {const res = response(); await exports.zoomOAuthStart(req, res); return res;};
  const callback = async state => {const res = response(); await exports.zoomOAuthCallback({method: 'GET', query: {code: 'test-code', state}}, res); return res;};
  return {db, req, start, callback, tokenRequests: () => tokenRequests};
}
test('OAuth binds credentials to the initiating existing teacher and consumes state once', async () => {
  const f = oauthFixture(), started = await f.start(); assert.equal(started.statusCode, 200);
  const state = new URL(started.body.authorizationUrl).searchParams.get('state');
  const completed = await f.callback(state); assert.equal(completed.statusCode, 200);
  const stored = f.db.data.get('zoomTeacherCredentials/teacher');
  assert.equal(stored.status, 'connected'); assert.equal(stored.encryptedTokens.algorithm, 'aes-256-gcm');
  assert.equal(stored.access_token, undefined); assert.ok(!completed.body.includes('private-access'));
  assert.equal((await f.callback(state)).statusCode, 400); assert.equal(f.tokenRequests(), 1);
});
test('disabled teacher account blocks OAuth callback before token exchange', async () => {
  const f = oauthFixture({active: false}), started = await f.start();
  const state = new URL(started.body.authorizationUrl).searchParams.get('state');
  assert.equal((await f.callback(state)).statusCode, 400); assert.equal(f.tokenRequests(), 0);
});
test('tampered or expired OAuth state never exchanges an authorization code', async () => {
  const f = oauthFixture(), started = await f.start();
  const state = new URL(started.body.authorizationUrl).searchParams.get('state');
  assert.equal((await f.callback(state.slice(0, -1) + (state.endsWith('A') ? 'B' : 'A'))).statusCode, 400);
  const pending = [...f.db.data.values()].find(value => value.status === 'pending');
  pending.expiresAt = Timestamp.fromMillis(Date.now() - 1000);
  assert.equal((await f.callback(state)).statusCode, 400); assert.equal(f.tokenRequests(), 0);
});
test('OAuth start rejects an untrusted form origin', async () => {
  const f = oauthFixture(); f.req.is = () => true; f.req.headers.origin = 'https://example.invalid';
  assert.equal((await f.start()).statusCode, 403); assert.equal(f.db.data.size, 0);
});
