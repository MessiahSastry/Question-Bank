'use strict';
// Isolated Zoom meeting API. All Zoom credentials remain server-side.
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const REGION = 'asia-south1';
const CLIENT_ID = defineSecret('ZOOM_CLIENT_ID');
const CLIENT_SECRET = defineSecret('ZOOM_CLIENT_SECRET');
const KEY = defineSecret('ZOOM_TOKEN_ENCRYPTION_KEY');
const ORIGINS = new Set([
  'https://messiahsastry.github.io',
  'https://stpatricks-questionbank.web.app'
]);
const NEED_CREATE = 'meeting:write:meeting';
const NEED_UPDATE = 'meeting:update:meeting';
const stamp = () => admin.firestore.FieldValue.serverTimestamp();
const removeField = () => admin.firestore.FieldValue.delete();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function cors(req, res) {
  const origin = String(req.headers.origin || '');
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Vary', 'Origin');
  if (origin) {
    if (!ORIGINS.has(origin)) {
      res.status(403).json({error: 'This site is not permitted.'});
      return false;
    }
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  }
  return true;
}
function problem(res, status, code, message) {
  return res.status(status).json({error: code, message});
}
async function uidFrom(req) {
  const m = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''));
  if (!m || m[1].length > 8192) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(m[1], true);
    if (!decoded.uid || !decoded.email || decoded.firebase?.sign_in_provider === 'anonymous') return null;
    return decoded.uid;
  } catch (_) { return null; }
}
function secretKey() {
  const key = Buffer.from(KEY.value(), 'base64');
  if (key.length !== 32) throw new Error('Invalid Zoom encryption key');
  return key;
}
function unseal(bundle) {
  if (!bundle || bundle.algorithm !== 'aes-256-gcm') throw new Error('Unsupported Zoom token envelope');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(bundle.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(bundle.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(bundle.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}
function seal(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return {algorithm: 'aes-256-gcm', iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64')};
}
const scopes = tokens => new Set(String(tokens.scope || '').split(/\s+/).filter(Boolean));
async function credential(uid) {
  const snap = await db.collection('zoomTeacherCredentials').doc(uid).get();
  if (!snap.exists || snap.get('status') !== 'connected' || !snap.get('encryptedTokens')) return null;
  return {snap, tokens: unseal(snap.get('encryptedTokens'))};
}
function zoomErrorMessage(status) {
  if (status === 401) return 'Zoom authorization expired. Reconnect your Zoom account.';
  if (status === 403) return 'Zoom denied meeting access. Add the required meeting permissions in the Zoom Developer app, then reconnect.';
  if (status === 429) return 'Zoom is receiving too many requests. Retry shortly.';
  if (status === 400) return 'Zoom rejected the meeting details. Check the class date and duration.';
  return 'Zoom could not complete this request. Retry the class meeting generation.';
}
async function refreshToken(uid, current) {
  const credRef = db.collection('zoomTeacherCredentials').doc(uid);
  const lock = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  // Zoom rotates refresh tokens. A per-teacher transaction lock stops two
  // simultaneous classes from spending the same refresh token.
  await db.runTransaction(async tx => {
    const snap = await tx.get(credRef);
    if (!snap.exists || snap.get('status') !== 'connected') throw new Error('ZOOM_RECONNECT');
    const until = snap.get('refreshLockUntil');
    if (until && until.toMillis() > now) throw new Error('ZOOM_BUSY');
    tx.update(credRef, {refreshLock: lock, refreshLockUntil: admin.firestore.Timestamp.fromMillis(now + 60000)});
  });
  try {
    const auth = Buffer.from(CLIENT_ID.value().trim() + ':' + CLIENT_SECRET.value().trim()).toString('base64');
    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: current.refresh_token}).toString(),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('ZOOM_RECONNECT');
    const fresh = await response.json();
    if (!fresh.access_token || !fresh.refresh_token) throw new Error('ZOOM_RECONNECT');
    const data = {
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      token_type: fresh.token_type || 'bearer',
      scope: fresh.scope || current.scope || '',
      api_url: fresh.api_url || current.api_url || 'https://api.zoom.us'
    };
    await db.runTransaction(async tx => {
      const snap = await tx.get(credRef);
      if (!snap.exists || snap.get('refreshLock') !== lock) throw new Error('ZOOM_BUSY');
      tx.update(credRef, {
        encryptedTokens: seal(data),
        accessExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + Math.max(60, Number(fresh.expires_in) || 3600) * 1000),
        refreshLock: removeField(), refreshLockUntil: removeField()
      });
    });
    return data;
  } catch (e) {
    await db.runTransaction(async tx => {
      const snap = await tx.get(credRef);
      if (snap.exists && snap.get('refreshLock') === lock) {
        tx.update(credRef, {refreshLock: removeField(), refreshLockUntil: removeField()});
      }
    }).catch(() => {});
    throw e;
  }
}
async function access(uid) {
  const c = await credential(uid);
  if (!c) throw new Error('ZOOM_NOT_CONNECTED');
  if ((c.snap.get('accessExpiresAt')?.toMillis() || 0) > Date.now() + 90000) return c.tokens;
  return refreshToken(uid, c.tokens);
}
function classDetails(m) {
  const start = m.startAt?.toMillis?.();
  const duration = Number(m.durationMinutes);
  if (!Number.isSafeInteger(start) || start < Date.now() - 60000 ||
      !Number.isInteger(duration) || duration < 5 || duration > 240 ||
      !m.class || !m.section || !m.subject || !m.topic) {
    throw new Error('CLASS_INVALID');
  }
  const topic = ['St. Patrick\'s School', m.class, m.section, m.subject, m.topic].join(' | ').slice(0, 200);
  return {
    topic,
    type: 2,
    start_time: new Date(start).toISOString(),
    timezone: 'Asia/Kolkata',
    duration,
    agenda: String(m.instructions || '').slice(0, 1000),
    settings: {
      waiting_room: true,
      join_before_host: false,
      mute_upon_entry: true,
      participant_video: false,
      host_video: true,
      auto_recording: 'none'
    }
  };
}
async function zoomRequest(url, method, payload, token) {
  const r = await fetch(url, {
    method,
    headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(16000)
  });
  if (!r.ok) {
    const err = new Error('ZOOM_API');
    err.httpStatus = r.status;
    throw err;
  }
  return method === 'PATCH' ? null : r.json();
}
exports.zoomConnectionStatus = onRequest({
  region: REGION, invoker: 'public', maxInstances: 5, secrets: [KEY]
}, async (req, res) => {
  if (!cors(req, res)) return;
  if (req.method !== 'GET') return problem(res, 405, 'METHOD', 'Method not allowed');
  const uid = await uidFrom(req);
  if (!uid) return problem(res, 401, 'SCHOOL_LOGIN', 'Open this page using your existing CampusConnect teacher login.');
  try {
    const c = await credential(uid);
    if (!c) return res.json({connected: false, canCreate: false, canUpdate: false});
    const granted = scopes(c.tokens);
    return res.json({connected: true, canCreate: granted.has(NEED_CREATE) || granted.has('meeting:write'), canUpdate: granted.has(NEED_UPDATE) || granted.has('meeting:write')});
  } catch (e) {
    console.error('Zoom status failed', e?.name || 'Error');
    return problem(res, 500, 'STATUS_FAILED', 'Unable to check the Zoom connection. Refresh and retry.');
  }
});
exports.zoomCreateMeeting = onRequest({
  region: REGION, invoker: 'public', maxInstances: 5,
  secrets: [CLIENT_ID, CLIENT_SECRET, KEY]
}, async (req, res) => {
  if (!cors(req, res)) return;
  if (req.method !== 'POST') return problem(res, 405, 'METHOD', 'Method not allowed');
  const uid = await uidFrom(req);
  if (!uid) return problem(res, 401, 'SCHOOL_LOGIN', 'Your school sign-in has expired. Reopen CampusConnect.');
  const id = req.body?.meetingId;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,150}$/.test(id)) {
    return problem(res, 400, 'CLASS_ID', 'Select a saved class.');
  }
  const ref = db.collection('meetings').doc(id);
  const claim = crypto.randomBytes(16).toString('hex');
  let locked = false;
  let snapshot;
  try {
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const m = snap.exists ? snap.data() : null;
      if (!m || m.teacherId !== uid) throw new Error('CLASS_OWNER');
      if (m.status !== 'scheduled') throw new Error('CLASS_INACTIVE');
      const detail = classDetails(m);
      if (m.zoomJoinUrl && m.zoomMeetingId && m.zoomProvisionedRevision === m.revision) return {ready: true};
      const lock = m.zoomProvisioning;
      if (lock && lock.until?.toMillis?.() > Date.now()) throw new Error('CLASS_BUSY');
      tx.update(ref, {zoomProvisioning: {claim, until: admin.firestore.Timestamp.fromMillis(Date.now() + 120000)}});
      return {ready: false, revision: m.revision, m, detail};
    });
    if (result.ready) return res.json({success: true, alreadyReady: true});
    locked = true;
    snapshot = result;
    const tokens = await access(uid);
    const granted = scopes(tokens);
    if (!granted.has(NEED_CREATE) && !granted.has('meeting:write')) {
      throw new Error('ZOOM_SCOPE_CREATE');
    }
    const updating = !!result.m.zoomMeetingId;
    if (updating && !granted.has(NEED_UPDATE) && !granted.has('meeting:write')) {
      throw new Error('ZOOM_SCOPE_UPDATE');
    }
    const apiUrl = 'https://api.zoom.us/v2/' +
      (updating ? 'meetings/' + encodeURIComponent(String(result.m.zoomMeetingId)) : 'users/me/meetings');
    const response = await zoomRequest(apiUrl, updating ? 'PATCH' : 'POST', result.detail, tokens.access_token);
    const joinUrl = updating ? result.m.zoomJoinUrl : response?.join_url;
    const meetingId = updating ? result.m.zoomMeetingId : String(response?.id || '');
    if (!/^https:\/\/([a-z0-9-]+\.)*zoom\.us\/j\/\d{9,13}(\?|$)/i.test(String(joinUrl || '')) ||
        !/^\d{9,13}$/.test(String(meetingId))) {
      throw new Error('ZOOM_REPLY_INVALID');
    }
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const m = snap.exists ? snap.data() : null;
      if (!m || m.teacherId !== uid || m.zoomProvisioning?.claim !== claim) throw new Error('CLASS_CHANGED');
      if (m.status !== 'scheduled' || m.revision !== snapshot.revision) throw new Error('CLASS_CHANGED');
      tx.update(ref, {
        zoomMeetingId: String(meetingId),
        ...(!updating ? {zoomPasscode: String(response?.password || '')} : {}),
        zoomJoinUrl: String(joinUrl),
        zoomWebUrl: String(joinUrl),
        zoomProvisionedRevision: snapshot.revision,
        zoomProvisionedAt: stamp(),
        zoomProvisioning: removeField()
      });
    });
    return res.json({success: true});
  } catch (e) {
    if (locked) {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.get('zoomProvisioning.claim') === claim) {
          tx.update(ref, {zoomProvisioning: removeField()});
        }
      }).catch(() => {});
    }
    if (e.message === 'ZOOM_NOT_CONNECTED' || e.message === 'ZOOM_RECONNECT') {
      return problem(res, 409, 'ZOOM_RECONNECT', 'Connect or reconnect your Zoom account, then select Generate Zoom Meeting.');
    }
    if (e.message === 'ZOOM_SCOPE_CREATE' || e.message === 'ZOOM_SCOPE_UPDATE') {
      return problem(res, 403, 'ZOOM_SCOPE', 'Your Zoom app needs meeting:write:meeting and meeting:update:meeting permissions. Add them in Zoom Developer Scopes, then reconnect your Zoom account.');
    }
    if (e.message === 'ZOOM_BUSY' || e.message === 'CLASS_BUSY') {
      return problem(res, 409, 'BUSY', 'Another request is already processing. Retry in a moment.');
    }
    if (e.message === 'CLASS_OWNER') return problem(res, 403, 'CLASS_OWNER', 'This is not your scheduled class.');
    if (e.message === 'CLASS_CHANGED') return problem(res, 409, 'CLASS_CHANGED', 'The class changed during Zoom creation. Refresh and try again.');
    if (e.message === 'CLASS_INVALID' || e.message === 'CLASS_INACTIVE') return problem(res, 400, 'CLASS_INVALID', 'This class must be scheduled in the future before a Zoom meeting can be created.');
    if (e.message === 'ZOOM_API') {
      console.error('Zoom meeting API failed with HTTP status', e.httpStatus);
      return problem(res, e.httpStatus === 429 ? 429 : 502, 'ZOOM_API', zoomErrorMessage(e.httpStatus));
    }
    console.error('Zoom meeting generation failed', e?.name || 'Error', e?.message === 'ZOOM_REPLY_INVALID' ? 'invalid Zoom response' : 'unexpected');
    return problem(res, 500, 'CREATE_FAILED', 'Zoom could not complete the meeting. Review the class before retrying.');
  }
});