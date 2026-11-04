'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {jsPDF} = require('../../vendor/jspdf.umd.min.js');

test('attendance PDF retains all 45 roster rows, portrait pagination and teacher overrides', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../online-class-teacher.html'), 'utf8');
  const section = (from, to) => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)));
  const start = Date.now() - 45 * 60000, end = start + 40 * 60000;
  const m = {teacherId: 'teacher', teacherName: 'Test Teacher', subject: 'English', topic: 'Attendance verification test',
    class: '6th Class', section: 'Greenhouse', academicYear: '2026-27', startAt: new Date(start),
    endAt: new Date(end), durationMinutes: 40, zoomActualStartedAt: new Date(start), zoomActualEndedAt: new Date(end)};
  const rows = Array.from({length: 45}, (_, i) => ({id: 'student-' + i, roll: String(i + 1),
    name: 'STUDENT_' + String(i + 1).padStart(3, '0') + ' Example Of A Longer School Register Name',
    status: i === 0 ? 'present' : '', record: {}}));
  const state = {attendance: {id: 'test-class', m, rows, changes: new Map(), serverVerified: true}};
  let pdf, bytes;
  function TestPdf(options) {
    pdf = new jsPDF(options);
    pdf.save = () => {bytes = Buffer.from(pdf.output('arraybuffer'));};
    return pdf;
  }
  const button = {};
  const context = vm.createContext({state, Date, window: {jspdf: {jsPDF: TestPdf}},
    $: () => button, message() {}, validYear: () => true, academicYear: () => '2026-27',
    dateParts: () => ({date: '2026-11-04'})});
  vm.runInContext(section('  function ms(', '  function message(') +
    section('  function attendanceFingerprint(', '  function attendanceNotice(') +
    section('  async function loadPdfLibrary(', '  function stepDate('), context);
  await context.downloadAttendancePdf();
  assert.ok(bytes?.length > 1000);
  assert.ok(pdf.internal.getNumberOfPages() >= 2);
  assert.ok(pdf.internal.pageSize.getWidth() < pdf.internal.pageSize.getHeight());
  const raw = bytes.toString('latin1');
  assert.match(raw, /STUDENT_001/); assert.match(raw, /STUDENT_045/); assert.match(raw, /Teacher/);
  assert.equal(rows[0].status, 'present'); assert.equal(button.disabled, false);
  if (process.env.ONLINE_CLASS_PDF_PREVIEW) fs.writeFileSync(process.env.ONLINE_CLASS_PDF_PREVIEW, bytes);
});
