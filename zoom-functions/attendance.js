'use strict';

// Signed Zoom webhook intake. This module is deliberately not exported from
// index.js until the Zoom event secret has been stored in Secret Manager.
// No student browser may claim to have attended a meeting.
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
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
function eventId(kind, uuid, zoomUserId, when, code) {
  return digest([kind, uuid, zoomUserId, when, code].join('|'));
}
async function rebuildStudent(meetingRef, studentId) {
  const eventSnap = await meetingRef.collection('zoomAttendanceEvents')
    .where('studentId', '==', studentId).get();
  const timeline = eventSnap.docs.map(d => d.data()).filter(d =>
    (d.kind === 'join' || d.kind === 'leave') && Number.isFinite(d.atMs)
  ).sort((a, b) => a.atMs - b.atMs ||
    (a.kind === 'join' ? -1 : 1) - (b.kind === 'join' ? -1 : 1));
  const active = new Map(), intervals = [];
  let unmatchedExits = 0;
  for (const e of timeline) {
    const k = String(e.instanceKey || '');
    if (!k) continue;
    if (e.kind === 'join') {
      // A duplicate join is not a second presence period.
      if (!active.has(k)) active.set(k, e);
    } else {
      const entered = active.get(k);
      if (!entered || e.atMs < entered.atMs) {
        unmatchedExits++;
        continue;
      }
      intervals.push({
        joinedAt: new Date(entered.atMs).toISOString(),
        leftAt: new Date(e.atMs).toISOString(),
        reason: String(e.reason || '').slice(0, 140)
      });
      active.delete(k);
    }
  }
  for (const e of active.values()) {
    intervals.push({joinedAt:new Date(e.atMs).toISOString(), leftAt:null, reason:'Awaiting verified exit'});
  }
  intervals.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  await meetingRef.collection('attendance').doc(studentId).set({
    zoomSource: 'signed_zoom_webhook',
    zoomIntervals: intervals.slice(0, 200),
    zoomUnmatchedExits: unmatchedExits,
    zoomUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, {merge:true});
}
async function handleParticipant(meetingRef, body, kind, at) {
  const obj = body.payload && body.payload.object || {};
  const participant = obj.participant || {};
  const meetingUuid = String(obj.uuid || '');
  const zoomUserId = String(participant.user_id || '');
  const code = studentCode(participant.user_name);
  if (!zoomUserId || !/^[A-Za-z0-9_-]{3,128}$/.test(zoomUserId)) return;
  const binding = meetingRef.collection('zoomParticipantBindings')
    .doc(userKey(meetingUuid, zoomUserId));
  let studentId = '';
  if (code) {
    const mapped = await meetingRef.collection('zoomStudentCodes').doc(code).get();
    if (mapped.exists) {
      studentId = String(mapped.data().studentId || '');
      await binding.set({studentId, code, meetingUuid, zoomUserId,
        updatedAt:admin.firestore.FieldValue.serverTimestamp()}, {merge:true});
    }
  }
  if (!studentId) {
    const bound = await binding.get();
    if (bound.exists) studentId = String(bound.data().studentId || '');
  }
  if (!studentId || studentId.length > 160 || studentId.includes('/')) return;
  const instanceKey = userKey(meetingUuid, zoomUserId);
  const unique = eventId(kind, meetingUuid, zoomUserId, at, code);
  const recordRef = meetingRef.collection('zoomAttendanceEvents').doc(unique);
  try {
    await recordRef.create({
      studentId, kind, atMs:at, instanceKey,
      zoomUserId, meetingUuid,
      reason:kind==='leave'?String(participant.leave_reason || '').slice(0,140):'',
      recordedAt:admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    if (Number(e.code) === 6 || e.code === 'already-exists') return;
    throw e;
  }
  await rebuildStudent(meetingRef, studentId);
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
  if (!/^\d{9,13}$/.test(zoomMeetingId)) return res.status(204).end();
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
      zoomWebhookSeenAt:admin.firestore.FieldValue.serverTimestamp()
    };
    if (body.event === 'meeting.started') {
      update.zoomActualStartedAt = admin.firestore.Timestamp.fromMillis(at);
    } else if (body.event === 'meeting.ended') {
      update.zoomActualEndedAt = admin.firestore.Timestamp.fromMillis(at);
    }
    if (body.event === 'meeting.started' || body.event === 'meeting.ended') {
      // Duplicate/reordered events may occur; preserve the earliest start,
      // and latest end, rather than overwriting them with stale event times.
      await db.runTransaction(async tx => {
        const snap=await tx.get(meetingRef);
        if (!snap.exists) return;
        const d=snap.data(), patch={zoomWebhookSeenAt:update.zoomWebhookSeenAt};
        if (body.event === 'meeting.started') {
          if (!d.zoomActualStartedAt || at < d.zoomActualStartedAt.toMillis())
            patch.zoomActualStartedAt = admin.firestore.Timestamp.fromMillis(at);
        } else {
          if (!d.zoomActualEndedAt || at > d.zoomActualEndedAt.toMillis())
            patch.zoomActualEndedAt = admin.firestore.Timestamp.fromMillis(at);
        }
        tx.set(meetingRef,patch,{merge:true});
      });
    } else {
      await handleParticipant(meetingRef,body,body.event.endsWith('joined')?'join':'leave',at);
      await meetingRef.set(update,{merge:true});
    }
    return res.status(204).end();
  } catch (e) {
    console.error('Zoom attendance webhook failed', e?.code || e?.name || 'error');
    return res.status(500).end();
  }
});
