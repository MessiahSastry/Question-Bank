'use strict';
// Package-compatibility smoke check. No production credentials or data access.
process.env.GCLOUD_PROJECT = 'online-class-audit-test';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9999';
const {getApps, deleteApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
(async () => {
  const api = require('../index');
  const expected = ['zoomAttendanceWebhook', 'zoomConnectionStatus', 'zoomCreateMeeting',
    'zoomOAuthCallback', 'zoomOAuthStart', 'zoomSdkParticipantSignature'];
  for (const name of expected) {
    if (typeof api[name] !== 'function') throw new Error('Missing function export: ' + name);
  }
  console.log('All six Zoom function exports load with the installed Firebase SDKs.');
  await getFirestore().terminate();
  await Promise.all(getApps().map(app => deleteApp(app)));
})().catch(error => {console.error(error.message); process.exitCode = 1;});
