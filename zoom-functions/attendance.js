'use strict';

// Signed Zoom webhook intake. The verification secret must exist before deployment.
// No student browser may claim to have attended a meeting.
const crypto = require('node:crypto');
const {getApps, initializeApp} = require('firebase-admin/app');
const {getFirestore, Timestamp, FieldValue} = require('firebase-admin/firestore');
const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const {reconcileEvents} = require('./attendance-model');
if (!getApps().length) initializeApp();
const db = getFirestore();
const WEBHOOK_TOKEN = defineSecret('ZOOM_WEBHOOK_SECRET_TOKEN');
const REGION = 'asia-south1';

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function hmac(token, data) {
  return crypto.createHmac('sha256', token).update(data).digest('hex');
}
function validSignature(req, token) {
  const time = String(req.get('x-zm-request-timestamp') || '');
  const signature = String(req.get('x-zm-signature') || '');
  if (!/^\d{10}$/.test(time) || !/^v0=[0-9a-f]{64}$/i.test(signature)) return false;
  if (Math.abs(Date.now() - Number(time) * 1000) > 10 * 60 * 1000) return false;
  const raw = req.rawBody;
  if (!Buffer.isBuffer(raw) || raw.length > 128000) return false;
  const expected = 'v0=' + hmac(token, 'v0:' + time + ':' + raw.toString('utf8'));
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
function eventTime(input, fallback) {
  const value = typeof input === 'string' ? Date.parse(input) : NaN;
  const ms = Number.isFinite(value) ? value : Number(fallback);
  return Number.isFinite(ms) && ms > Date.UTC(2020, 0, 1) && ms < Date.now() + 60 * 60 * 1000 ? ms : null;
}
function userKey(meetingUuid, zoomUserId) {
  return digest(String(meetingUuid || '') + '|' + String(zoomUserId || ''));
}
function studentCode(name) {
  const match = String(name || '').match(/\[SP-([A-Za-z0-9_-]{12})\]\s*$/);
  return match ? match[1] : '';
}
function eventId(kind, uuid, zoomUserId, when) {
  // A retry or a name change must not turn one Zoom event into two events.
  return digest([kind, uuid, zoomUserId, when].join('|'));
}
async function handleParticipant(meetingRef, body, kind, at) {
  const obj = body.payload && body.payload.object || {};
  const participant = obj.participant || {};
  const meetingUuid = String(obj.uuid || '');
  const zoomUserId = String(participant.user_id || '');
  const code = studentCode(participant.user_name);
  if (!zoomUserId || zoomUserId.length > 128 || /[\x00-\x1f]/.test(zoomUserId)) return;
  const instanceKey = userKey(meetingUuid, zoomUserId);
  const binding = meetingRef.collection('zoomParticipantBindings')
    .doc(instanceKey);
  const events = meetingRef.collection('zoomAttendanceEvents');
  const recordRef = events.doc(eventId(kind, meetingUuid, zoomUserId, at));
  // Raw event, orphan repair and projection commit together. A failed commit
  // leaves nothing half-saved; retries also repair projections from older code.
  await db.runTransaction(async tx => {
    const bound = await tx.get(binding);
    const existing = await tx.get(recordRef);
    const mapped = code ? await tx.get(meetingRef.collection('zoomStudentCodes').doc(code)) : null;
    const mappedId = mapped?.exists ? String(mapped.get('studentId') || '') : '';
    const boundId = bound.exists ? String(bound.get('studentId') || '') : '';
    if (mappedId && boundId && mappedId !== boundId) {
      tx.set(meetingRef, {zoomAttendanceIssue: 'conflicting_student_binding'}, {merge: true});
      return;
    }
    const studentId = mappedId || boundId;
    if (studentId && (studentId.length > 160 || studentId === '.' || studentId === '..' || /[\/\x00-\x1f]/.test(studentId))) return;
    const record = {studentId, kind, atMs: at, instanceKey, zoomUserId, meetingUuid,
      reason: kind === 'leave' ? String(participant.leave_reason || '').slice(0, 140) : '',
      recordedAt: FieldValue.serverTimestamp()};
    let attendanceRef, projection, orphanDocs = [];
    if (studentId) {
      attendanceRef = meetingRef.collection('attendance').doc(studentId);
      // This shared row serializes concurrent updates for the same student.
      await tx.get(attendanceRef);
      const history = await tx.get(events.where('studentId', '==', studentId));
      const instance = await tx.get(events.where('instanceKey', '==', instanceKey));
      orphanDocs = instance.docs.filter(doc => !doc.get('studentId'));
      const combined = new Map(history.docs.map(doc => [doc.id, doc.data()]));
      for (const doc of orphanDocs) combined.set(doc.id, {...doc.data(), studentId});
      combined.set(recordRef.id, existing.exists ? {...existing.data(), studentId} : record);
      projection = reconcileEvents([...combined.values()]);
    }
    if (!existing.exists) tx.create(recordRef, record);
    else if (studentId && !existing.get('studentId')) tx.update(recordRef, {studentId});
    for (const doc of orphanDocs) {
      if (doc.id !== recordRef.id) tx.update(doc.ref, {studentId});
    }
    if (studentId) {
      tx.set(binding, {studentId, meetingUuid, zoomUserId,
        updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      tx.set(attendanceRef, {...projection, zoomSource: 'signed_zoom_webhook',
        zoomUpdatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
    if (!existing.exists || orphanDocs.length || (studentId && !existing.get('studentId'))) {
      // Late records invalidate a teacher's earlier final-absence confirmation.
      tx.set(meetingRef, {zoomAttendanceRevision: FieldValue.increment(1),
        zoomWebhookSeenAt: FieldValue.serverTimestamp()}, {merge: true});
    }
  });
}
exports.zoomAttendanceWebhook = onRequest({
  region:REGION, invoker:'public', maxInstances:5,
  secrets:[WEBHOOK_TOKEN], timeoutSeconds:60
}, async (req, res) => {
  res.set('Cache-Control','no-store');
  if (req.method !== 'POST' || !req.is('application/json')) return res.status(405).end();
  const secret = WEBHOOK_TOKEN.value();
  if (!secret) return res.status(503).end();
  const body = req.body || {};
  if (body.event === 'endpoint.url_validation') {
    const plainToken = String(body.payload && body.payload.plainToken || '');
    if (!plainToken || plainToken.length > 200) return res.status(400).end();
    return res.status(200).json({
      plainToken, encryptedToken:hmac(secret, plainToken)
    });
  }
  if (!validSignature(req, secret)) return res.status(401).end();
  const supported = new Set([
    'meeting.started', 'meeting.ended',
    'meeting.participant_joined', 'meeting.participant_left'
  ]);
  if (!supported.has(body.event)) return res.status(204).end();
  const obj = body.payload && body.payload.object || {};
  const zoomMeetingId = String(obj.id || '');
  const uuid = String(obj.uuid || '');
  if (!/^\d{9,13}$/.test(zoomMeetingId) || !uuid || uuid.length > 200 || /[\x00-\x1f]/.test(uuid)) return res.status(204).end();
  const at = eventTime(
    body.event === 'meeting.participant_joined' ? obj.participant?.join_time :
    body.event === 'meeting.participant_left' ? obj.participant?.leave_time :
    body.event === 'meeting.started' ? obj.start_time : obj.end_time,
    body.event_ts
  );
  if (at == null) return res.status(204).end();
  try {
    // Only accept events for a school meeting generated by our own Zoom backend.
    const found = await db.collection('meetings')
      .where('zoomMeetingId','==',zoomMeetingId).limit(2).get();
    if (found.size !== 1) return res.status(204).end();
    const meetingRef=found.docs[0].ref, meeting=found.docs[0].data();
    if (meeting.status === 'cancelled') return res.status(204).end();
    const update = {
      zoomWebhookSeenAt:FieldValue.serverTimestamp()
    };
    if (body.event === 'meeting.started') {
      update.zoomActualStartedAt = Timestamp.fromMillis(at);
    } else if (body.event === 'meeting.ended') {
      update.zoomActualEndedAt = Timestamp.fromMillis(at);
    }
    if (body.event === 'meeting.started' || body.event === 'meeting.ended') {
      // Duplicate/reordered events may occur; preserve the earliest start,
      // and latest end, rather than overwriting them with stale event times.
      await db.runTransaction(async tx => {
        const snap=await tx.get(meetingRef);
        if (!snap.exists) return;
        const d=snap.data(), patch={zoomWebhookSeenAt:update.zoomWebhookSeenAt};
        if (d.zoomMeetingUuid && d.zoomMeetingUuid !== uuid) {
          // Reusing a Zoom number must never combine two separate sessions
          // into one long class. Keep the evidence for manual review.
          tx.set(meetingRef, {...patch, zoomAttendanceIssue:'multiple_meeting_instances'}, {merge:true});
          return;
        }
        patch.zoomMeetingUuid = uuid;
        if (body.event === 'meeting.started') {
          if (!d.zoomActualStartedAt || at < d.zoomActualStartedAt.toMillis())
            patch.zoomActualStartedAt = Timestamp.fromMillis(at);
        } else {
          if (!d.zoomActualEndedAt || at > d.zoomActualEndedAt.toMillis())
            patch.zoomActualEndedAt = Timestamp.fromMillis(at);
        }
        tx.set(meetingRef,patch,{merge:true});
      });
    } else {
      if (meeting.zoomMeetingUuid && meeting.zoomMeetingUuid !== uuid) {
        await meetingRef.set({zoomAttendanceIssue:'multiple_meeting_instances'}, {merge:true});
      }
      await handleParticipant(meetingRef,body,body.event.endsWith('joined')?'join':'leave',at);
    }
    return res.status(204).end();
  } catch (e) {
    console.error('Zoom attendance webhook failed', e?.code || e?.name || 'error');
    return res.status(500).end();
  }
});
