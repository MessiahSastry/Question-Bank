'use strict';

// Separate Firebase codebase for St. Patrick's School Zoom OAuth.
// This file does not modify or import the existing quiz/reminder functions.
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const CLIENT_ID = defineSecret('ZOOM_CLIENT_ID');
const CLIENT_SECRET = defineSecret('ZOOM_CLIENT_SECRET');
const ENCRYPTION_KEY = defineSecret('ZOOM_TOKEN_ENCRYPTION_KEY');
const REGION = 'asia-south1';
const SCHOOL_ORIGIN = 'https://stpatricks-questionbank.web.app';
const CAMPUS_ORIGIN = 'https://messiahsastry.github.io';
const CAMPUS_TEACHER_PAGE = CAMPUS_ORIGIN + '/Question-Bank/online-class-teacher.html';
const REDIRECT_URI = SCHOOL_ORIGIN + '/zoom/oauth/callback';
const STATE_TTL_MS = 10 * 60 * 1000;

function secureHeaders(res) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
}
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function timingEquals(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function finishPage(res, status, heading, detail) {
  secureHeaders(res);
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  const page = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>St. Patrick’s School · Zoom</title><style>' +
    'body{font:16px/1.6 system-ui,Arial;background:#f3f7fb;color:#173652;' +
    'max-width:560px;margin:12vh auto;padding:26px}main{background:white;' +
    'padding:30px;border:1px solid #d8e4ef;border-radius:15px}h1{font-size:1.3rem}' +
    '</style></head><body><main><h1>' + heading +
    '</h1><p>' + detail + '</p>' +
    '<p><a href="' + CAMPUS_TEACHER_PAGE + '">Return to school teacher page</a></p>' +
    '</main></body></html>';
  return res.status(status).type('html').send(page);
}
// Classify only well-known Zoom OAuth errors. Never log or display raw
// responses, authorisation codes, tokens, state values, or client credentials.
function safeZoomTokenError(response, payload) {
  const knownCodes = new Set([
    'invalid_grant','invalid_client','invalid_request',
    'unauthorized_client','access_denied','unsupported_grant_type',
    'invalid_scope','server_error','temporarily_unavailable'
  ]);
  const rawCode = typeof payload?.error === 'string' ?
    payload.error.toLowerCase().trim() : '';
  const oauthCode = knownCodes.has(rawCode) ? rawCode : 'unknown';
  const rawNumeric = payload?.code;
  const zoomCode = Number.isInteger(rawNumeric) && rawNumeric >= 4000 &&
    rawNumeric <= 4999 ? String(rawNumeric) : 'none';
  const reason = typeof payload?.reason === 'string' ?
    payload.reason.toLowerCase() : '';
  const issue = /redirect.?uri|redirect.?url/.test(reason) ?
      'redirect_mismatch' :
    /invalid authorization code|invalid grant|expired|already used/.test(reason) ?
      'invalid_or_expired_code' :
    /invalid client|client secret|client id|client_id/.test(reason) ?
      'client_credentials' : 'unspecified';
  return {httpStatus: response.status, oauthCode, zoomCode, issue};
}
function seal(data, keyBase64) {
  const key = Buffer.from(String(keyBase64 || ''), 'base64');
  if (key.length !== 32) throw new Error('Invalid token encryption key length');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'), cipher.final()
  ]);
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}
// School accounts are provisioned directly by the administrator.
// No per-teacher Firestore allowlist is needed for Zoom connection.
async function teacherUid(req) {
  const match = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''));
  // A signed-in teacher on GitHub Pages can submit the existing Firebase
  // ID token in a top-level HTTPS POST. No token goes into the URL.
  const formToken = req.is('application/x-www-form-urlencoded') &&
    typeof req.body?.firebaseIdToken === 'string' ?
    req.body.firebaseIdToken : '';
  const token = match ? match[1] : formToken;
  if (!token || token.length > 8192) return null;
  const decoded = await admin.auth().verifyIdToken(token, true);
  if (!decoded.uid || !decoded.email ||
      decoded.firebase?.sign_in_provider === 'anonymous') return null;
  return decoded.uid;
}

// Firestore clients can edit general collections under the school's existing rules.
// Sign the OAuth state with a server-only key so no client can change its UID/expiry.
function stateSignature(uid, nonce, expiresMs, keyBase64) {
  const key = Buffer.from(String(keyBase64 || ''), 'base64');
  if (key.length !== 32) throw new Error('Invalid state signing key length');
  return crypto.createHmac('sha256', key)
    .update('zoom-oauth-v1|' + nonce + '|' + uid + '|' + expiresMs)
    .digest('base64url');
}

exports.zoomOAuthStart = onRequest({
  region: REGION, invoker: 'public', maxInstances: 5,
  secrets: [CLIENT_ID, ENCRYPTION_KEY]
}, async (req, res) => {
  secureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});
  const formMode = !!req.is('application/x-www-form-urlencoded');
  const origin = String(req.headers.origin || '');
  if (formMode) {
    // The allowed school's GitHub Pages origin sends a top-level form POST,
    // bypassing fetch CORS while still requiring a verified Firebase ID token.
    if (origin !== CAMPUS_ORIGIN && origin !== SCHOOL_ORIGIN) {
      return finishPage(res, 403, 'Zoom connection not started',
        'Open the teacher page through CampusConnect and try again.');
    }
  } else if (origin && origin !== SCHOOL_ORIGIN) {
    return res.status(403).json({error: 'Use the school website'});
  }
  try {
    const uid = await teacherUid(req);
    if (!uid) {
      if (formMode) return finishPage(res, 403, 'Zoom connection not started',
        'Your school sign-in has expired. Return to CampusConnect and sign in.');
      return res.status(403).json({error: 'School sign-in required'});
    }

    const nonce = crypto.randomBytes(32).toString('base64url');
    const expiresMs = Date.now() + STATE_TTL_MS;
    const state = nonce + '.' + stateSignature(uid, nonce, expiresMs,
      ENCRYPTION_KEY.value());
    await db.collection('zoomOAuthPending').doc(sha256(state)).create({
      teacherUid: uid,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresMs)
    });

    const authorize = new URL('https://zoom.us/oauth/authorize');
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('client_id', CLIENT_ID.value().trim());
    authorize.searchParams.set('redirect_uri', REDIRECT_URI);
    authorize.searchParams.set('state', state);

    // Do not depend on browser cookies: some in-app mobile browsers do not
    // retain them across the CampusConnect -> Zoom -> Firebase redirects.
    // State is bound to the authenticated teacher by a server-only HMAC and
    // a ten-minute, one-use pending record verified in the callback.
    if (formMode) return res.redirect(303, authorize.href);
    return res.status(200).json({authorizationUrl: authorize.href});
  } catch (err) {
    console.error('Zoom OAuth initiation failed:', err?.code || err?.name || 'unknown');
    if (formMode) return finishPage(res, 500, 'Zoom connection not started',
      'The secure connection could not be started. Return to the teacher page.');
    return res.status(500).json({error: 'Could not start Zoom authorisation'});
  }
});

exports.zoomOAuthCallback = onRequest({
  region: REGION, invoker: 'public', maxInstances: 5,
  secrets: [CLIENT_ID, CLIENT_SECRET, ENCRYPTION_KEY]
}, async (req, res) => {
  secureHeaders(res);
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const code = req.query.code;
  const state = req.query.state;
  // Distinguish the failure stage without exposing the Zoom code, signed
  // state, cookie or encrypted tokens in the browser or Cloud Logging.
  if (typeof req.query.error === 'string') {
    console.warn('Zoom OAuth callback status', 'ZC01');
    return finishPage(res, 400, 'Zoom authorisation was not approved',
      'Zoom did not approve the request. Please try from your school teacher page. (ZC01)');
  }
  if (typeof code !== 'string' || code.length < 2 || code.length > 4096) {
    console.warn('Zoom OAuth callback status', 'ZC02');
    return finishPage(res, 400, 'Zoom connection not completed',
      'Zoom did not return an authorisation code. Please reconnect from the teacher page. (ZC02)');
  }
  if (typeof state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(state)) {
    console.warn('Zoom OAuth callback status', 'ZC03');
    return finishPage(res, 400, 'Zoom connection not completed',
      'The Zoom authorisation response was incomplete. Please reconnect. (ZC03)');
  }
  // The signed, unpredictable OAuth state is validated against Firestore
  // in a transaction and can only be claimed once. This also binds the Zoom
  // credentials to the same Firebase UID that initiated authorisation.

  const pendingRef = db.collection('zoomOAuthPending').doc(sha256(state));
  let uid, stage = 'state';
  try {
    // A state may be used only once, even if callbacks arrive concurrently.
    uid = await db.runTransaction(async tx => {
      const snap = await tx.get(pendingRef);
      const expiresMs = snap.exists ? snap.get('expiresAt')?.toMillis() : null;
      const teacher = snap.exists ? snap.get('teacherUid') : null;
      const [nonce, mac] = state.split('.');
      if (!snap.exists || snap.get('status') !== 'pending' ||
          typeof teacher !== 'string' || !teacher ||
          !Number.isSafeInteger(expiresMs) || expiresMs < Date.now() ||
          !timingEquals(mac, stateSignature(teacher, nonce, expiresMs,
            ENCRYPTION_KEY.value()))) {
        throw new Error('Invalid, expired or already claimed OAuth state');
      }
      tx.update(pendingRef, {
        status: 'claimed',
        claimedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return snap.get('teacherUid');
    });

    stage = 'token';
    const form = new URLSearchParams({
      grant_type: 'authorization_code', code,
      redirect_uri: REDIRECT_URI
    });
    const basic = Buffer.from(CLIENT_ID.value().trim() + ':' +
      CLIENT_SECRET.value().trim()).toString('base64');
    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + basic,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString(),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) {
      // Read response for a known error category only. Never output the
      // original JSON or any untrusted Zoom response text.
      let payload = null;
      try {
        const errorBody = await response.text();
        if (errorBody.length <= 4096) payload = JSON.parse(errorBody);
      } catch (_) {}
      const reason = safeZoomTokenError(response, payload);
      console.error('Zoom OAuth token exchange rejected:', JSON.stringify(reason));
      const err = new Error('Zoom token exchange rejected');
      err.safeZoomCategory = reason.issue !== 'unspecified' ?
        reason.issue : reason.oauthCode;
      throw err;
    }
    const tokens = await response.json();
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Zoom did not provide both required OAuth tokens');
    }

    const encrypted = seal({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || 'bearer',
      scope: tokens.scope || '',
      api_url: tokens.api_url || 'https://api.zoom.us'
    }, ENCRYPTION_KEY.value());

    stage = 'storage';
    await db.collection('zoomTeacherCredentials').doc(uid).set({
      encryptedTokens: encrypted,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      accessExpiresAt: admin.firestore.Timestamp.fromMillis(
        Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000
      ),
      provider: 'zoom',
      status: 'connected'
    }, {merge: true});
    await pendingRef.delete();

    return finishPage(res, 200, 'Zoom account connected',
      'Your Zoom authorisation was saved securely. Return to the school teacher page.');
  } catch (err) {
    const category = stage === 'state' ? 'ZC06' :
      stage === 'token' ? 'ZC07' : 'ZC08';
    console.error('Zoom OAuth callback failed', category,
      err?.code || err?.name || 'unknown');
    const diagnostic = category === 'ZC07' ?
      (err?.safeZoomCategory === 'redirect_mismatch' ? 'ZC07-REDIRECT' :
       err?.safeZoomCategory === 'invalid_or_expired_code' ||
       err?.safeZoomCategory === 'invalid_grant' ? 'ZC07-CODE' :
       err?.safeZoomCategory === 'client_credentials' ||
       err?.safeZoomCategory === 'invalid_client' ? 'ZC07-CLIENT' :
       'ZC07-OTHER') : category;
    const detail = category === 'ZC06' ?
      'The one-time Zoom connection request expired or was already used. (ZC06)' :
      category === 'ZC07' ?
      'Zoom rejected the account authorisation exchange. Diagnostic: ' + diagnostic + '.' :
      'The school service could not save the Zoom connection. (ZC08)';
    return finishPage(res, 400, 'Zoom connection not completed',
      detail + ' Return to your teacher page to retry.');
  }
});
