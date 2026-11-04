'use strict';

const {getAuth} = require('firebase-admin/auth');

// These claims can only be granted by a trusted Firebase Admin SDK session.
// An email/password account or a client-editable users/{uid} role is insufficient.
function isSchoolTeacher(user) {
  return !!user?.uid && !!user.email && !user.disabled &&
    user.firebase?.sign_in_provider !== 'anonymous' &&
    (user.schoolTeacher === true || user.schoolAdmin === true);
}

async function teacherUid(req, {allowForm = false} = {}) {
  const bearer = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''));
  const form = allowForm && req.is('application/x-www-form-urlencoded') &&
    typeof req.body?.firebaseIdToken === 'string' ? req.body.firebaseIdToken : '';
  const token = bearer ? bearer[1] : form;
  if (!token || token.length > 8192) return null;
  try {
    const decoded = await getAuth().verifyIdToken(token, true);
    return isSchoolTeacher(decoded) ? decoded.uid : null;
  } catch (_) {
    return null;
  }
}

async function teacherStillApproved(uid) {
  const user = await getAuth().getUser(uid);
  return isSchoolTeacher({...user.customClaims, uid: user.uid,
    email: user.email, disabled: user.disabled});
}

module.exports = {isSchoolTeacher, teacherUid, teacherStillApproved};
