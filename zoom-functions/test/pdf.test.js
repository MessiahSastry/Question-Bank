'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {jsPDF} = require('../../vendor/jspdf.umd.min.js');

const html = fs.readFileSync(path.resolve(__dirname, '../../online-class-teacher.html'), 'utf8');
const section = (from, to) => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)));
async function render({count = 45, veryLongNames = false, unsaved = false} = {}) {
  const start = Date.now() - 45 * 60000, end = start + 40 * 60000;
  const m = {teacherId: 'teacher', teacherName: 'Test Teacher', subject: 'English', topic: 'Attendance verification test',
    class: '6th Class', section: 'Greenhouse', academicYear: '2026-27', startAt: new Date(start),
    endAt: new Date(end), durationMinutes: 40, zoomActualStartedAt: new Date(start), zoomActualEndedAt: new Date(end)};
  const rows = Array.from({length: count}, (_, i) => ({id: 'student-' + i, roll: String(i + 1),
    name: 'STUDENT_' + String(i + 1).padStart(3, '0') + ' Example Of A Longer School Register Name' +
      (veryLongNames ? ' Additional Full Name Components That Must Be Preserved In The Printed Attendance Register' : ''),
    status: i === 0 ? 'present' : '', record: {}}));
  const changes = new Map(unsaved ? [['student-0', 'absent']] : []);
  const state = {attendance: {id: 'test-class', m, rows, changes, serverVerified: true}};
  let pdf, bytes;
  const spans = [], messages = [];
  function TestPdf(options) {
    pdf = new jsPDF(options);
    const text = pdf.text;
    pdf.text = function(value, x, y, options) {
      const lines = Array.isArray(value) ? value : [value];
      const size = this.getFontSize(), factor = options?.lineHeightFactor || this.getLineHeightFactor();
      lines.forEach((line, index) => {
        const width = this.getTextWidth(String(line));
        const left = options?.align === 'right' ? x - width : x;
        spans.push({text: String(line), left, right: left + width,
          baseline: y + index * size * factor, size});
      });
      return text.call(this, value, x, y, options);
    };
    pdf.save = () => {bytes = Buffer.from(pdf.output('arraybuffer'));};
    return pdf;
  }
  const button = {};
  const context = vm.createContext({state, Date, window: {jspdf: {jsPDF: TestPdf}},
    $: () => button, message: (_id, text) => messages.push(text), ask: async () => true,
    validYear: () => true, academicYear: () => '2026-27', dateParts: () => ({date: '2026-11-05'})});
  vm.runInContext(section('  function ms(', '  function message(') +
    section('  function attendanceFingerprint(', '  function attendanceNotice(') +
    section('  async function loadPdfLibrary(', '  function stepDate('), context);
  await context.downloadAttendancePdf();
  assert.ok(bytes?.length > 1000, messages.join('\n'));
  assert.ok(pdf.internal.pageSize.getWidth() < pdf.internal.pageSize.getHeight());
  const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight();
  for (const span of spans) {
    assert.ok(span.left >= 27.5 && span.right <= w - 27.5, 'Horizontal clipping: ' + span.text);
    assert.ok(span.baseline + span.size / 4 < h - 8, 'Footer overflow: ' + span.text);
    assert.ok(span.size >= 8, 'Text is too small');
  }
  const printed = spans.map(span => span.text).join(' ').replace(/\s+/g, '');
  for (const row of rows) assert.ok(printed.includes(row.name.replace(/\s+/g, '')), 'Missing or truncated student name: ' + row.name);
  assert.equal(rows[0].status, 'present');
  assert.equal(button.disabled, false);
  assert.equal(state.pdfDownloading, false);
  return {pdf, bytes, spans, messages, rows};
}

test('45 students with full register names fit one portrait A4 attendance page', async () => {
  const {pdf, bytes, messages} = await render();
  assert.equal(pdf.internal.getNumberOfPages(), 1);
  assert.match(messages.at(-1), /1 page/);
  assert.match(bytes.toString('latin1'), /Teacher/);
  if (process.env.ONLINE_CLASS_PDF_PREVIEW) fs.writeFileSync(process.env.ONLINE_CLASS_PDF_PREVIEW, bytes);
});
test('larger rosters and very long names continue on readable pages without clipping or truncation', async () => {
  const {pdf, bytes} = await render({count: 120, veryLongNames: true});
  assert.ok(pdf.internal.getNumberOfPages() > 1);
  assert.match(bytes.toString('latin1'), /STUDENT_120/);
  if (process.env.ONLINE_CLASS_PDF_LONG_PREVIEW) fs.writeFileSync(process.env.ONLINE_CLASS_PDF_LONG_PREVIEW, bytes);
});
test('an unsaved teacher override is included and clearly marked as a preview', async () => {
  const {spans, rows} = await render({count: 3, unsaved: true});
  const printed = spans.map(span => span.text).join(' ');
  assert.match(printed, /Unsaved teacher changes/);
  assert.match(printed, /Absent \(Teacher\)/);
  assert.equal(rows[0].status, 'present');
});

function loaderFixture(mode) {
  const state = {}, window = {}, attempted = [], removed = [], timers = [];
  function ReadyPdf() {}
  const context = vm.createContext({state, window,
    document: {createElement: () => ({remove() {removed.push(this.src);}}),
      head: {append(script) {
        attempted.push(script.src);
        if (mode.value === 'timeout') return;
        queueMicrotask(() => {
          if (mode.value === 'local' || (mode.value === 'fallback' && attempted.length > 1)) {
            window.jspdf = {jsPDF: ReadyPdf}; script.onload();
          } else script.onerror();
        });
      }}},
    setTimeout(fn, delay) {
      const timer = {delay, cancelled: false}; timers.push(timer);
      queueMicrotask(() => {if (!timer.cancelled && mode.value === 'timeout') fn();});
      return timer;
    }, clearTimeout(timer) {timer.cancelled = true;},
    uiError: text => Object.assign(new Error(text), {userMessage: text})});
  vm.runInContext(section('  async function loadPdfLibrary(', '  async function downloadAttendancePdf('), context);
  return {state, window, attempted, removed, timers, load: context.loadPdfLibrary, ReadyPdf};
}
test('PDF loading uses the bundled library once for simultaneous requests', async () => {
  const f = loaderFixture({value: 'local'});
  const result = await Promise.all([f.load(), f.load()]);
  assert.equal(result[0], f.ReadyPdf); assert.equal(result[1], f.ReadyPdf);
  assert.deepEqual(f.attempted, ['vendor/jspdf.umd.min.js']);
});
test('PDF loading falls back to the existing CDN when the local file cannot load', async () => {
  const f = loaderFixture({value: 'fallback'});
  assert.equal(await f.load(), f.ReadyPdf);
  assert.equal(f.attempted.length, 2);
  assert.match(f.attempted[1], /cdnjs\.cloudflare\.com/);
  assert.deepEqual(f.removed, ['vendor/jspdf.umd.min.js']);
});
test('stalled PDF downloads time out and a later attempt can retry', async () => {
  const mode = {value: 'timeout'}, f = loaderFixture(mode);
  await assert.rejects(f.load(), /Could not load the PDF generator/);
  assert.equal(f.state.pdfLoader, null);
  assert.equal(f.removed.length, 2);
  assert.ok(f.timers.every(timer => timer.delay === 15000));
  mode.value = 'local'; assert.equal(await f.load(), f.ReadyPdf);
});
