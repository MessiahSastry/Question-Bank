'use strict';
// Run from a trusted administrator environment. Read-only unless --apply is present.
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const args = process.argv.slice(2);
const uidIndex = args.indexOf('--uid');
const uid = uidIndex >= 0 ? args[uidIndex + 1] : '';
const grant = args.includes('--grant'), revoke = args.includes('--revoke');
if (!uid || uid.startsWith('--') || uid.length > 128 || grant === revoke ||
    args.some(arg => !['--uid', uid, '--grant', '--revoke', '--apply'].includes(arg))) {
  console.error('Usage: node scripts/teacher-access.js --uid FIREBASE_UID (--grant | --revoke) [--apply]');
  process.exitCode = 1;
} else {
  initializeApp({projectId: 'stpatricks-questionbank'});
  (async () => {
    const user = await getAuth().getUser(uid);
    if (!user.email || user.disabled) throw new Error('Use an active school teacher email account');
    const claims = {...user.customClaims};
    if (grant) claims.schoolTeacher = true;
    else delete claims.schoolTeacher;
    if (!args.includes('--apply')) {
      console.log('DRY RUN: would ' + (grant ? 'grant' : 'remove') + ' schoolTeacher for UID ' + uid);
      console.log('No authentication claims were changed. Review the UID, then add --apply to commit.');
    } else {
      await getAuth().setCustomUserClaims(uid, claims);
      console.log('Updated schoolTeacher for UID ' + uid + '. Sign in again to refresh the token.');
    }
    if (revoke && claims.schoolAdmin === true) {
      console.log('This account still has schoolAdmin access. Removing schoolTeacher does not revoke administrator access.');
    }
  })().catch(error => {
    console.error('Teacher access change failed:', error.code || error.name || 'Error');
    process.exitCode = 1;
  });
}
