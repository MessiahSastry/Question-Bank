'use strict';

const {getAuth} = require('firebase-admin/auth');

// Reuse CampusConnect's existing signed-in email account model. Do not add
// individual teacher setup, custom claims or changes to deployed Firestore rules.
// Meeting endpoints separately enforce the existing teacherId ownership checks.
function isExistingTeacherAccount(user) {
  return !!user?.uid && !!user.email && !user.disabled &&
    user.firebase?.sign_in_provider !== 'anonymous';
}

async function teacherUid(req, {allowForm = false} = {}) {
  const bearer = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''));
  const form = allowForm && req.is('application/x-www-form-urlencoded') &&
    typeof req.body?.firebaseIdToken === 'string' ? req.body.firebaseIdToken : '';
  const token = bearer ? bearer[1] : form;
  if (!token || token.length > 8192) return null;
  try {
    const decoded = await getAuth().verifyIdToken(token, true);
    return isExistingTeacherAccount(decoded) ? decoded.uid : null;
  } catch (_) {
    return null;
  }
}

async function teacherAccountActive(uid) {
  const user = await getAuth().getUser(uid);
  return isExistingTeacherAccount({uid: user.uid,
    email: user.email, disabled: user.disabled});
}

module.exports = {isExistingTeacherAccount, teacherUid, teacherAccountActive};
