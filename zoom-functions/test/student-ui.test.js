'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.resolve(__dirname, '../../online-class.html'), 'utf8');

test('SDK reconnect and disconnect states follow Zoom status events', () => {
  const sdkState = {inMeeting: true, sessionActive: true, guardEnabled: true}, messages = [];
  const context = vm.createContext({sdkState, document: {hidden: false},
    message: (_id, text) => messages.push(text), render() {}, clearTimeout() {}, leaveSdkOnSwitch() {}});
  const from = html.indexOf('  function onSdkMeetingStatus('), to = html.indexOf('  async function openEmbeddedZoom(', from);
  vm.runInContext(html.slice(from, to), context);
  context.onSdkMeetingStatus({status: 4}); assert.equal(sdkState.reconnecting, true);
  context.onSdkMeetingStatus({status: 2}); assert.equal(sdkState.reconnecting, false); assert.equal(sdkState.inMeeting, true);
  context.onSdkMeetingStatus({status: 3}); assert.equal(sdkState.inMeeting, false); assert.equal(sdkState.sessionActive, false);
  assert.ok(messages.some(message => message.includes('Rejoin')));
});
test('an active SDK session cannot start a second join while connecting or reconnecting', () => {
  const state = {confirmed: true, selected: {}, cooldownUntil: 0}, sdkState = {sessionActive: true};
  const context = vm.createContext({state, sdkState, sdkPilot: true, Date,
    eligibleForLookup: () => true, timeGate: () => ({open: true})});
  const from = html.indexOf('  function canJoin('), to = html.indexOf('  function closeConfirmation(', from);
  vm.runInContext(html.slice(from, to), context);
  assert.equal(context.canJoin(), false); sdkState.sessionActive = false; sdkState.reconnecting = true;
  assert.equal(context.canJoin(), false); sdkState.reconnecting = false; assert.equal(context.canJoin(), true);
});
test('a verified actual Zoom end closes joining even before the scheduled end', () => {
  const start = Date.now() - 60000;
  const state = {meeting: {status: 'scheduled', startAt: start, endAt: start + 2400000, zoomActualEndedAt: Date.now()}};
  const context = vm.createContext({state, Date, ms: value => Number(value), endOf: m => m.endAt,
    formatDateTime: () => '', countdownText: () => ''});
  const from = html.indexOf('  function timeGate('), to = html.indexOf('  function zoomLinks(', from);
  vm.runInContext(html.slice(from, to), context);
  assert.equal(context.timeGate().open, false); assert.equal(context.timeGate().code, 'ended');
});
