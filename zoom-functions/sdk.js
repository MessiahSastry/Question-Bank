'use strict';

// Test-only Meeting SDK participant authorisation for the existing school class.
// Zoom Client Secret is never sent to students; only a short-lived SDK JWT is issued.
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const CLIENT_ID = defineSecret('ZOOM_CLIENT_ID');
const CLIENT_SECRET = defineSecret('ZOOM_CLIENT_SECRET');
const ORIGINS = new Set([
  'https://stpatricks-questionbank.web.app',
  'https://messiahsastry.github.io'
]);
const REGION = 'asia-south1';

function digits10(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? d : '';
}
function validDocId(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 160 &&
    v !== '.' && v !== '..' && !/[\x00-\x1f\/]/.test(v);
}
function deny(res, status, code, message) {
  return res.status(status).json({error: code, message});
}
function signature(meetingId) {
  const now = Math.floor(Date.now() / 1000);
  const iat = now - 30, exp = now + 3600;
  const header = {alg: 'HS256', typ: 'JWT'};
  const payload = {
    appKey: CLIENT_ID.value().trim(),
    mn: meetingId,
    role: 0,
    iat, exp, tokenExp: exp
  };
  const encoded = [header, payload].map(v =>
    Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return encoded + '.' + crypto.createHmac('sha256', CLIENT_SECRET.value().trim())
    .update(encoded).digest('base64url');
}
exports.zoomSdkParticipantSignature = onRequest({
  region: REGION, invoker: 'public', maxInstances: 5,
  secrets: [CLIENT_ID, CLIENT_SECRET]
}, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Vary', 'Origin');
  const origin = String(req.headers.origin || '');
  if (!ORIGINS.has(origin)) return deny(res, 403, 'ORIGIN', 'Open the school class page.');
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' || !req.is('application/json')) {
    return deny(res, 405, 'METHOD', 'Use the school Join Online Class button.');
  }
  const bearer = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''));
  if (!bearer || bearer[1].length > 8192) return deny(res, 401, 'AUTH', 'School access expired.');
  let authUser;
  try {authUser = await admin.auth().verifyIdToken(bearer[1], true);}
  catch (_) {return deny(res, 401, 'AUTH', 'Please reload the class page.');}
  if (!authUser.uid) return deny(res, 401, 'AUTH', 'School access is required.');

  const {meetingId, studentId, parentPhone} = req.body || {};
  if (![meetingId, studentId].every(validDocId) || !digits10(parentPhone)) {
    return deny(res, 400, 'INPUT', 'Please confirm your student details again.');
  }
  try {
    const meetingSnap = await db.collection('meetings').doc(meetingId).get();
    if (!meetingSnap.exists) return deny(res, 404, 'CLASS', 'Class not found.');
    const meeting = meetingSnap.data();
    const start = meeting.startAt?.toMillis?.();
    const end = meeting.endAt?.toMillis?.() ||
      start + Number(meeting.durationMinutes || 40) * 60000;
    if (meeting.status !== 'scheduled' || !Number.isFinite(start) ||
        !Number.isFinite(end) || Date.now() < start - 10 * 60000 ||
        Date.now() >= end) {
      return deny(res, 403, 'WINDOW', 'This class is not open for joining.');
    }
    if (Number(meeting.zoomProvisionedRevision) !== Number(meeting.revision) ||
        !/^\d{9,13}$/.test(String(meeting.zoomMeetingId || ''))) {
      return deny(res, 409, 'MEETING', 'The teacher has not prepared this Zoom meeting.');
    }
    const year = meeting.academicYear || meeting.year;
    if (!/^\d{4}-\d{2}$/.test(String(year)) ||
        !validDocId(meeting.classId) || !validDocId(meeting.sectionId)) {
      return deny(res, 409, 'SECTION', 'Class registration needs to be checked by your teacher.');
    }
    const studentSnap = await db.collection('years').doc(year)
      .collection('classes').doc(meeting.classId)
      .collection('sections').doc(meeting.sectionId)
      .collection('students').doc(studentId).get();
    if (!studentSnap.exists) return deny(res, 403, 'STUDENT', 'Student not found in this section.');
    const student = studentSnap.data() || {};
    if (digits10(student.parentPhone) !== digits10(parentPhone)) {
      return deny(res, 403, 'STUDENT', 'Registered parent mobile number does not match this student.');
    }
    const name = String(student.name || '').trim();
    if (!name || name.length > 100) return deny(res, 403, 'STUDENT', 'Invalid student name.');
    const roll = String(student.rollNo ?? student.rollNumber ?? student.roll ?? '').trim();
    // A plain-english name (and roll) helps teachers verify the waiting room.
    const displayName = (name + (roll ? ' · Roll ' + roll : '')).slice(0, 120);
    // The passcode is captured from Zoom's create-meeting response for new classes.
    // Older meetings may lack it; do not misrepresent a failed SDK join as attendance.
    const passWord = String(meeting.zoomPasscode || '');
    return res.status(200).json({
      signature: signature(String(meeting.zoomMeetingId)),
      meetingNumber: String(meeting.zoomMeetingId),
      passWord,
      userName: displayName
    });
  } catch (e) {
    console.error('SDK authorisation failed', e?.name || 'Error');
    return deny(res, 500, 'SDK_ERROR', 'Cannot prepare secure Zoom access. Please retry.');
  }
});
