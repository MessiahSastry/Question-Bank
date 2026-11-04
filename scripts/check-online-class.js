'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');

for (const file of fs.readdirSync(path.join(root, 'zoom-functions')).filter(name => name.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', path.join(root, 'zoom-functions', file)], {stdio: 'inherit'});
}
for (const file of ['online-class-teacher.html', 'online-class.html',
  'firebase-site/online-class-teacher.html', 'firebase-site/online-class.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  let count = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!match[2].trim() || /type\s*=\s*["']application\//i.test(match[1])) continue;
    new Function(match[2]);
    count++;
  }
  if (!count) throw new Error('No inline JavaScript found in ' + file);
  console.log(file + ': inline JavaScript passed');
}
if (!fs.readFileSync(path.join(root, 'online-class.html')).equals(
  fs.readFileSync(path.join(root, 'firebase-site/online-class.html')))) {
  throw new Error('The root and Firebase student pages must stay identical.');
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
if (config.hosting.public !== 'firebase-site') throw new Error('Unexpected Hosting folder');
for (const file of ['404.html', 'index.html', 'quiz.html', 'online-class-teacher.html', 'online-class.html']) {
  if (!fs.existsSync(path.join(root, 'firebase-site', file))) throw new Error('Missing Hosting file: ' + file);
}
for (const name of ['zoomOAuthStart', 'zoomOAuthCallback', 'zoomCreateMeeting',
  'zoomConnectionStatus', 'zoomSdkParticipantSignature']) {
  if (!config.hosting.rewrites.some(route => route.function?.functionId === name &&
    route.function.region === 'asia-south1')) throw new Error('Missing Zoom rewrite: ' + name);
}
if (!config.functions.some(item => item.codebase === 'zoom' && item.source === 'zoom-functions')) {
  throw new Error('The isolated Zoom functions codebase is missing');
}
console.log('Student copies, Hosting assets and Zoom rewrites passed');
