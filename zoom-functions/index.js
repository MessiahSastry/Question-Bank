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
function cookieValue(req, name) {
  const found = String(req.headers.cookie || '').split(';')
    .map(x => x.trim()).find(x => x.startsWith(name + '='));
  return found ? found.slice(name.length + 1) : '';
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
    '</h1><p>' + detail + '</p></main></body></html>';
  return res.status(status).type('html').send(page);
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
async function teacherUid(req) {
  const match = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''));
  if (!match) return null;
  const decoded = await admin.auth().verifyIdToken(match[1], true);
  if (!decoded.uid || decoded.firebase?.sign_in_provider === 'anonymous') return null;
  // Explicit school-admin allowlist. Do not grant Zoom access to every Firebase user.
  const access = await db.collection('zoomTeacherAccess').doc(decoded.uid).get();
  if (!access.exists || access.get('enabled') !== true) return null;
  return decoded.uid;
}

exports.zoomOAuthStart = onRequest({
  region: REGION, invoker: 'public', maxInstances: 5,
  secrets: [CLIENT_ID]
}, async (req, res) => {
  secureHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});
  if (req.headers.origin && req.headers.origin !== SCHOOL_ORIGIN) {
    return res.status(403).json({error: 'Use the school website'});
  }
  try {
    const uid = await teacherUid(req);
    if (!uid) return res.status(403).json({error: 'Teacher authorisation required'});

    const state = crypto.randomBytes(32).toString('base64url');
    await db.collection('zoomOAuthPending').doc(sha256(state)).create({
      teacherUid: uid,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + STATE_TTL_MS)
    });

    const authorize = new URL('https://zoom.us/oauth/authorize');
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('client_id', CLIENT_ID.value().trim());
    authorize.searchParams.set('redirect_uri', REDIRECT_URI);
    authorize.searchParams.set('state', state);

    // SameSite=Lax permits the Zoom -> school top-level GET callback.
    res.setHeader('Set-Cookie', 'zoom_oauth_state=' + state +
      '; Max-Age=600; Path=/zoom/oauth/callback; HttpOnly; Secure; SameSite=Lax');
    return res.status(200).json({authorizationUrl: authorize.href});
  } catch (err) {
    console.error('Zoom OAuth initiation failed:', err?.code || err?.name || 'unknown');
    return res.status(500).json({error: 'Could not start Zoom authorisation'});
  }
});

exports.zoomOAuthCallback = onRequest({
  region: REGION, invoker: 'public', maxInstances: 5,
  secrets: [CLIENT_ID, CLIENT_SECRET, ENCRYPTION_KEY]
}, async (req, res) => {
  secureHeaders(res);
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  // Clear the temporary browser cookie on both success and failure.
  res.setHeader('Set-Cookie',
    'zoom_oauth_state=; Max-Age=0; Path=/zoom/oauth/callback; HttpOnly; Secure; SameSite=Lax');

  const code = req.query.code;
  const state = req.query.state;
  if (typeof code !== 'string' || code.length < 2 || code.length > 4096 ||
      typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !timingEquals(state, cookieValue(req, 'zoom_oauth_state'))) {
    return finishPage(res, 400, 'Zoom connection not completed',
      'Return to the school teacher page and start the connection again.');
  }

  const pendingRef = db.collection('zoomOAuthPending').doc(sha256(state));
  let uid;
  try {
    // A state may be used only once, even if callbacks arrive concurrently.
    uid = await db.runTransaction(async tx => {
      const snap = await tx.get(pendingRef);
      if (!snap.exists || snap.get('status') !== 'pending' ||
          snap.get('expiresAt').toMillis() < Date.now()) {
        throw new Error('Invalid, expired or already claimed OAuth state');
      }
      tx.update(pendingRef, {
        status: 'claimed',
        claimedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return snap.get('teacherUid');
    });

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
    if (!response.ok) throw new Error('Zoom token exchange was rejected');
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
    console.error('Zoom OAuth callback failed:', err?.code || err?.name || 'unknown');
    return finishPage(res, 400, 'Zoom connection not completed',
      'Please return to the school teacher page and try connecting again.');
  }
});
