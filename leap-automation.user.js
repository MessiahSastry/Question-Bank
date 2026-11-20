// ==UserScript==
// @name         St Patricks LEAP Automation
// @namespace    stpatricks-leap
// @version      1.2.7
// @description  FA and school-awarded SA1 marks entry with actual-SA1 priority
// @match        https://messiahsastry.github.io/Question-Bank/excel.html*
// @match        https://cse.ap.gov.in/loadccemarksentry*
// @match        https://cse.ap.gov.in/save*
// @updateURL    https://raw.githubusercontent.com/MessiahSastry/Question-Bank/main/leap-automation.user.js
// @downloadURL  https://raw.githubusercontent.com/MessiahSastry/Question-Bank/main/leap-automation.user.js
// @run-at       document-idle
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(() => {
  'use strict';

  const KEY = 'stpatricks-leap-packet-v1';
  const MAX_AGE = 4 * 60 * 60 * 1000;
  const school =
    location.hostname === 'messiahsastry.github.io';

  function valid(p) {
    return p && p.schema === 1 &&
      typeof p.nonce === 'string' &&
      /^(?:FA[1-4]|SA1)$/.test(p.exam) &&
      Number.isInteger(p.grade) &&
      p.grade >= 1 && p.grade <= 10 &&
      Number.isFinite(p.createdAt) &&
      Math.abs(Date.now() - p.createdAt) < MAX_AGE &&
      Array.isArray(p.records) &&
      p.records.length > 0 &&
      p.records.length <= 200 &&
      p.records.every(r =>
        (!r.childId || /^\d{10}$/.test(String(r.childId))) &&
        Array.isArray(r.subjects) &&
        r.subjects.every(s =>
          Array.isArray(s.parts) &&
          s.parts.length === (p.exam === 'SA1' ? 2 : 4) &&
          (p.exam !== 'SA1' ||
            ['actual', 'awarded', 'estimated', 'missing'].includes(s.source)) &&
          s.parts.every(n =>
            Number.isInteger(n) && n >= 0
          )
        )
      );
  }

  if (school) {
    document.addEventListener(
      'sp-leap-outgoing-ready',
      async () => {
        const el = document.getElementById(
          'sp-leap-outgoing'
        );
        if (!el) return;

        try {
          if (el.textContent.length > 1000000)
            throw Error('Data too large');

          const packet = JSON.parse(el.textContent);

          if (!valid(packet))
            throw Error('Invalid or expired data');

          await GM_setValue(KEY, packet);

          el.dataset.received = packet.nonce;

          document.dispatchEvent(
            new Event('sp-leap-outgoing-received')
          );

        } catch (err) {
          console.error('LEAP bridge:', err);
        }
      }
    );
    return;
  }

  const packet = GM_getValue(KEY, null);
  if (!packet) return;

  if (!valid(packet)) {
    GM_deleteValue(KEY);
    return;
  }

  const box = document.createElement('div');

      box.style.cssText =
    'position:fixed!important;' +
    'bottom:12px!important;' +
    'left:8px!important;right:8px!important;' +
    'z-index:2147483647!important;' +
    'padding:14px;background:#f9fbfd;' +
    'border:2px solid #086a42;border-radius:16px;' +
    'box-shadow:0 10px 32px rgba(15,23,42,.23);' +
    'color:#18352a;font:15px/1.4 system-ui,Arial,sans-serif;' +
    'max-height:55vh;overflow-y:auto;' +
    'box-sizing:border-box;';

  const title = document.createElement('b');
  title.textContent = 'School marks received';
  title.style.cssText = 'display:block;font-size:18px;line-height:1.3;';

  const info = document.createElement('p');

  info.textContent =
    `${packet.className} - ${packet.sectionName} - ` +
    `${packet.records.length} students.`;

  const clear = document.createElement('button');

  clear.textContent = 'Clear transferred data';

  clear.onclick = () => {
    GM_deleteValue(KEY);
    box.remove();
  };

  const previewBtn = document.createElement('button');
previewBtn.textContent = 'Preview Selected Student';
previewBtn.type = 'button';
previewBtn.style.cssText =
  'margin:8px;padding:8px;background:#087c47;' +
  'color:white;border:0;border-radius:6px';

const previewArea = document.createElement('div');
previewArea.style.cssText =
  'margin-top:8px;max-height:35vh;overflow:auto;' +
  'white-space:pre-wrap;font:13px Arial';

function cleanName(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

previewBtn.onclick = () => {
  const selects = Array.from(
    document.querySelectorAll('select')
  );

  const candidates = selects.filter(sel =>
    Array.from(sel.options).some(opt =>
      packet.records.some(r =>
        (r.childId &&
          (opt.text + ' ' + opt.value)
            .includes(String(r.childId))) ||
        cleanName(opt.text) === cleanName(r.name)
      )
    )
  );

  if (candidates.length !== 1) {
    previewArea.textContent =
      'Select the class and student in LEAP first.';
    return;
  }

  const sel = candidates[0];
  const opt = sel.selectedOptions[0];

  if (!opt || !sel.value ||
      /select|choose/i.test(opt.text.trim())) {
    previewArea.textContent =
      'Please select a student in LEAP.';
    return;
  }

  const selectedText = opt.text + ' ' + opt.value;
  const ids = selectedText.match(/\b\d{10}\b/g) || [];

  const matches = ids.length
    ? packet.records.filter(r =>
        r.childId && ids.includes(String(r.childId))
      )
    : packet.records.filter(r =>
        cleanName(r.name) === cleanName(opt.text)
      );

  if (matches.length !== 1) {
    previewArea.textContent =
      'Student not uniquely matched. Check Child ID.';
    return;
  }

  const r = matches[0];

  const lines = [
    'MATCHED STUDENT',
    'Name: ' + r.name,
    'Roll: ' + r.roll,
    '',
    'SUBJECT MARKS'
  ];

  for (const s of r.subjects) {
    const total = s.parts.reduce((a, b) => a + b, 0);
    const max = packet.exam === 'SA1'
      ? sa1SubjectMaxima(packet.grade, s.name).reduce((a,b)=>a+b,0)
      : 50;
    lines.push(
      s.name + ': ' +
      s.parts.join(' + ') +
      ' = ' + total + '/' + max +
      (packet.exam === 'SA1' ? ' (' + s.source + ')' : '')
    );
  }

  lines.push('', 'PREVIEW ONLY — Nothing saved.');

  previewArea.textContent = lines.join('\n');
};

// ---------- Automatic LEAP Marks Filling ----------

const fillBtn = document.createElement('button');
fillBtn.textContent = 'Fill Marks';
fillBtn.type = 'button';
fillBtn.style.cssText =
  'margin:8px;padding:12px;background:#087c47;' +
  'color:white;border:0;border-radius:7px;' +
  'font-size:15px;font-weight:bold';

const fillStatus = document.createElement('div');
fillStatus.style.cssText =
  'margin-top:12px;font:15px/1.4 system-ui,Arial,sans-serif;' +
  'white-space:pre-wrap';

const normal = x => String(x || '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '');

const studentName = x => String(x || '')
  .replace(/\([^)]*\)/g, '')
  .replace(/\b\d{6,}\b/g, '')
  .toUpperCase().replace(/[^A-Z]/g, '');

function subjectCode(name) {
  const key = normal(name);

  const aliases = {
    MATHEMATICS: 'MATH',
    MATH: 'MATH',
    PHYSICALSCIENCE: 'PHY',
    PHYSICS: 'PHY',
    BIOLOGICALSCIENCE: 'BIO',
    BIOLOGY: 'BIO',
    SOCIALSTUDIES: 'SOC',
    SOCIALSCIENCE: 'SOC',
    SOCIAL: 'SOC',
    COMPOSITETELUGU: 'TEL',
    TELUGU: 'TEL',
    GENERALSCIENCE: 'SCI',
    SCIENCE: 'SCI',
    ENVIRONMENTALSTUDIES: 'EVS',
    ENVIRONMENTALSCIENCE: 'EVS'
  };

  return aliases[key] || key;
}

function changeValue(el, value) {
  const proto = el.tagName === 'SELECT'
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;

  Object.getOwnPropertyDescriptor(proto, 'value')
    .set.call(el, String(value));

  el.dispatchEvent(new Event('input', { bubbles:true }));
  el.dispatchEvent(new Event('change', { bubbles:true }));
  if (el.tagName === 'INPUT')
    el.dispatchEvent(new Event('keyup', { bubbles:true }));
}


function sa1SubjectMaxima(grade, name) {
  if (grade <= 2) return [40, 40];
  if (grade <= 7) return [20, 60];
  const code = subjectCode(name);
  if (code === 'PHY' || code === 'BIO') return [10, 30];
  if (code === 'TEL' && normal(name) === 'COMPOSITETELUGU')
    return [20, 40];
  return [20, 60];
}

// Preserve the exact source rate when Telugu and Composite Telugu differ.
function sa1MarksForRow(subject, rowName, grade) {
  const sourceCaps = sa1SubjectMaxima(grade, subject.name);
  const caps = sa1SubjectMaxima(grade, rowName);
  const sourceMax = sourceCaps[0] + sourceCaps[1];
  if (!['actual', 'awarded'].includes(subject.source) ||
      !Number.isInteger(subject.total) ||
      !Array.isArray(subject.parts) || subject.parts.length !== 2 ||
      subject.parts.some((value, i) =>
        !Number.isInteger(value) || value < 0 || value > sourceCaps[i]
      ) ||
      subject.parts[0] + subject.parts[1] !== subject.total)
    throw Error('Invalid SA1 marks: ' + subject.name);

  if (subject.source === 'actual' && subject.sourceRate !== undefined &&
      (!Number.isFinite(subject.sourceRate) || subject.sourceRate < 0 ||
        subject.sourceRate > 1 ||
        Math.round(subject.sourceRate * sourceMax) !== subject.total))
    throw Error('Invalid SA1 source score: ' + subject.name);

  if (sourceCaps.every((maximum, i) => maximum === caps[i]))
    return {...subject, parts:[...subject.parts]};

  if (subjectCode(subject.name) !== 'TEL' ||
      subjectCode(rowName) !== 'TEL' || grade < 8 || grade > 9)
    throw Error('SA1 subject format mismatch: ' + subject.name);

  if (subject.source === 'actual' && subject.sourceRate === undefined)
    throw Error('Telugu format changed. Return to the School App and ' +
      'Send to LEAP again before filling.');

  const rate = subject.source === 'actual'
    ? subject.sourceRate : subject.total / sourceMax;
  const maximum = caps[0] + caps[1];
  const total = Math.round(rate * maximum);
  const first = Math.max(0, Math.min(
    caps[0], Math.round(total * caps[0] / maximum)
  ));
  return {...subject, total, parts:[first, total - first]};
}

// Only actual or school-awarded SA1 scores can be entered.
async function fillActualSA1(record) {
  if (packet.grade >= 10)
    throw Error('Class 10 SA1 format needs separate verification.');

  const unawarded = record.subjects.filter(
    s => s.source !== 'actual' && s.source !== 'awarded'
  );
  if (unawarded.length) {
    fillStatus.textContent =
      '⚠ SA1 filling blocked: school-awarded or actual marks missing for ' +
      record.name + '.\n' +
      unawarded.map(s => {
        const caps = sa1SubjectMaxima(packet.grade, s.name);
        return s.name + ': ' +
          (s.source === 'estimated'
            ? s.parts.join(' + ') + ' = ' + s.total + '/' +
              (caps[0] + caps[1]) + ' (FA1/FA2 draft only)'
            : 'No reliable FA1 and FA2 scores available');
      }).join('\n') +
      '\nFinalise school-awarded SA1 marks or enter actual marks, then transfer again.';
    return;
  }

  function subjectRow(name) {
    const found = Array.from(document.querySelectorAll('table tr'))
      .filter(tr =>
        tr.cells && tr.cells.length >= 6 &&
        subjectCode(tr.cells[1]?.textContent) === subjectCode(name)
      );
    if (found.length !== 1)
      throw Error('SA1 subject row not uniquely found: ' + name);
    return found[0];
  }

  function subjectAttendance(row, name) {
    const select = row.cells[2]?.querySelector('select');
    const yes = select && Array.from(select.options).find(o =>
      normal(o.textContent) === 'YES'
    );
    if (!select || select.disabled || !yes)
      throw Error('SA1 attendance option unavailable: ' + name);
    return {select, yes};
  }

  function writingLanguage(row, subjectName) {
    const rowName = row.cells[1]?.textContent || subjectName;
    const code = subjectCode(rowName);
    const expected = normal(rowName) === 'COMPOSITETELUGU' ? 'NA' :
      code === 'TEL' ? 'TELUGU' :
      code === 'HINDI' ? 'HINDI' : 'ENGLISH';
    const cell = row.cells[3];
    const select = cell?.querySelector('select');
    const matches = value => {
      const key = normal(value);
      return key === expected ||
        (expected === 'NA' && key === 'NOTAPPLICABLE');
    };
    const accepts = option => option &&
      (matches(option.textContent) || matches(option.value));

    // Composite Telugu may show fixed NA instead of a dropdown.
    if (!select) {
      const fixed = cell?.querySelector('input:not([type="hidden"])');
      if (expected === 'NA' &&
          (matches(cell?.textContent) ||
            (fixed && (fixed.disabled || fixed.readOnly) &&
              matches(fixed.value))))
        return {select:null, option:null, expected, accepted:true};
      return null;
    }
    const accepted = !!accepts(select.selectedOptions[0]);
    if (select.disabled)
      return expected === 'NA' && accepted
        ? {select:null, option:null, expected, accepted:true} : null;

    const option = Array.from(select.options).find(option =>
      !option.disabled && accepts(option)
    );
    if (!option)
      throw Error('SA1 writing language ' + expected +
        ' is not available for ' + rowName);
    return {select, option, expected, accepted};
  }

  function validateMaxima(row, caps, name) {
    for (let i = 0; i < caps.length; i++) {
      const td = row.cells[i + 4];
      const input = td?.querySelector('input:not([type="hidden"])');
      const displayed = td?.textContent.match(/\/\s*(\d+)/);
      const printedMax = displayed ? Number(displayed[1]) : NaN;
      const inputMax = input?.max ? Number(input.max) : NaN;
      const portalMax = Number.isFinite(inputMax) ? inputMax : printedMax;
      if (!input || !input.isConnected || portalMax !== caps[i] ||
          (Number.isFinite(printedMax) && printedMax !== caps[i]))
        throw Error('SA1 field maximum mismatch: ' + name +
          ' (expected ' + caps[i] + ', portal: ' + portalMax + ')');
    }
  }

  // Check all rows and maxima before changing attendance or marks.
  const plans = record.subjects.map(source => {
    const row = subjectRow(source.name);
    const rowName = row.cells[1]?.textContent || source.name;
    const caps = sa1SubjectMaxima(packet.grade, rowName);
    const subject = sa1MarksForRow(source, rowName, packet.grade);
    subjectAttendance(row, source.name);
    validateMaxima(row, caps, rowName);
    return {subject, caps};
  });

  for (const {subject, caps} of plans) {
    let row = subjectRow(subject.name);
    let {select, yes} = subjectAttendance(row, subject.name);
    if (select.value !== yes.value)
      changeValue(select, yes.value);

    let ready = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 180));
      row = subjectRow(subject.name);
      const inputs = caps.map((_, i) => row.cells[i + 4]
        ?.querySelector('input:not([type="hidden"])'));
      const selected = row.cells[2]?.querySelector('select');
      if (selected && normal(selected.selectedOptions[0]?.textContent) === 'YES' &&
          inputs.every(input =>
            input && input.isConnected && !input.readOnly && !input.disabled
          )) {
        ready = true;
        break;
      }
    }
    if (!ready)
      throw Error('SA1 marks fields did not become editable for ' +
        subject.name + ' after selecting attendance Yes. Do not Save.');

    let languageReady = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      row = subjectRow(subject.name);
      const language = writingLanguage(row, subject.name);
      if (language) {
        if (language.select &&
            language.select.value !== language.option.value)
          changeValue(language.select, language.option.value);
        await new Promise(resolve => setTimeout(resolve, 90));
        row = subjectRow(subject.name);
        const confirmed = writingLanguage(row, subject.name);
        if (confirmed?.accepted) {
          languageReady = true;
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 180));
    }
    if (!languageReady)
      throw Error('SA1 writing language was not accepted for ' +
        subject.name + '. Do not Save; check the LEAP form.');

    row = subjectRow(subject.name);
    validateMaxima(row, caps, subject.name);
    // Language and attendance changes may have replaced the input nodes.
    for (let i = 0; i < caps.length; i++) {
      row = subjectRow(subject.name);
      const input = row.cells[i + 4]
        ?.querySelector('input:not([type="hidden"])');
      if (!input || !input.isConnected || input.readOnly || input.disabled)
        throw Error('SA1 marks input changed unexpectedly: ' + subject.name);
      changeValue(input, subject.parts[i]);
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  }

  for (const {subject, caps} of plans) {
    const row = subjectRow(subject.name);
    const {select, yes} = subjectAttendance(row, subject.name);
    validateMaxima(row, caps, subject.name);
    const values = subject.parts.map((_,i) =>
      row.cells[i + 4]?.querySelector('input:not([type="hidden"])')
    );
    const language = writingLanguage(row, subject.name);
    if (!language?.accepted)
      throw Error('SA1 writing language not retained for ' +
        subject.name + '. Do not Save.');
    if (select.value !== yes.value ||
        values.some((input,i) =>
          !input || !input.isConnected || input.disabled || input.readOnly ||
          Number(input.value) !== subject.parts[i]
        ))
      throw Error('SA1 values not accepted for ' + subject.name +
        '. Do not Save; check the LEAP form.');
  }

  fillStatus.textContent = '✓ ' +
    packet.exam.replace(/^(FA|SA)([1-4])$/, '$1-$2') +
    ' marks filled for ' + record.name + '.';
}

fillBtn.onclick = async () => {
  try {
    const selects = Array.from(
      document.querySelectorAll('select')
    ).filter(s => !s.closest('table'));

    const selectedTexts = selects.map(s =>
      normal(s.selectedOptions[0]?.textContent)
    );

    const houseMap = {
  GREENHOUSE: 'A',
  YELLOWHOUSE: 'B',
  REDHOUSE: 'C'
};

const sectionName = String(packet.sectionName || '')
  .toUpperCase()
  .replace(/[^A-Z]/g, '');

const section = houseMap[sectionName] ||
  sectionName.charAt(0);

    const classCode = String(packet.grade) + section;

    if (
      !selectedTexts.includes(normal(packet.year)) ||
      !selectedTexts.includes(normal(packet.exam)) ||
      !selectedTexts.some(x =>
        x === classCode || x.startsWith(classCode + 'SECTION')
      )
    ) {
      throw Error(
        'Select the correct Year, Exam and Class in LEAP.'
      );
    }

    // Identify the selected student.
    const matches = [];

    for (const sel of selects) {
      const opt = sel.selectedOptions[0];
      if (!opt || !sel.value) continue;

      const label = opt.textContent + ' ' + opt.value;
      const ids = label.match(/\b\d{10}\b/g) || [];

      let found = packet.records.filter(r =>
        r.childId && ids.includes(String(r.childId))
      );

      // Name matching only when an ID match is unavailable.
      if (!found.length && !ids.length) {
        found = packet.records.filter(r =>
          studentName(r.name) === studentName(opt.textContent)
        );
      }

      if (found.length === 1) matches.push(found[0]);
    }

    const unique = [...new Set(matches)];

    if (unique.length !== 1)
      throw Error(
        'Student cannot be matched uniquely. Check Child ID.'
      );

    const record = unique[0];

    if (packet.exam === 'SA1') {
      await fillActualSA1(record);
      return;
    }

    // Find the subject rows in the loaded LEAP table.
    const rows = Array.from(
      document.querySelectorAll('table tr')
    ).filter(tr => tr.cells && tr.cells.length >= 9);

    const maxima = [5, 5, 5, 35];

    // Validate every subject before changing any marks.
    const plans = record.subjects.map(subject => {
      const found = rows.filter(tr =>
        subjectCode(tr.cells[1].textContent) ===
        subjectCode(subject.name)
      );

      if (found.length !== 1)
        throw Error(
          'Subject row not found: ' + subject.name
        );

      const tr = found[0];

      const inputs = maxima.map((max, i) => {
        const td = tr.cells[i + 4];
        const input = td?.querySelector(
          'input:not([type="hidden"])'
        );

        if (!input || input.disabled || input.readOnly)
          throw Error(
            'Marks field unavailable: ' + subject.name
          );

        const displayed = td.textContent.match(
          /\/\s*(\d+)/
        );

        const fieldMax = input.max
          ? Number(input.max)
          : displayed ? Number(displayed[1]) : NaN;

        if (fieldMax !== max)
          throw Error(
            'Marks field maximum mismatch: ' + subject.name
          );

        const value = subject.parts[i];

        if (!Number.isInteger(value) ||
            value < 0 || value > max)
          throw Error(
            'Invalid marks for ' + subject.name
          );

        return input;
      });

      const attendance = tr.cells[2].querySelector('select');
      const language = tr.cells[3].querySelector('select');

      const yes = attendance
        ? Array.from(attendance.options).find(o =>
            normal(o.textContent) === 'YES'
          )
        : null;

      if (attendance && !yes)
        throw Error(
          'Attendance option unavailable: ' + subject.name
        );

      let langOption = null;

      if (language && subject.language !== 'NA') {
        langOption = Array.from(language.options).find(o =>
          normal(o.textContent) === normal(subject.language)
        );

        if (!langOption)
          throw Error(
            'Writing language unavailable: ' + subject.name
          );
      }

      return {
        subject,
        inputs,
        attendance,
        yes,
        language,
        langOption
      };
    });

    // Apply the prepared marks.
    for (const p of plans) {
      if (p.attendance)
        changeValue(p.attendance, p.yes.value);

      if (p.language && p.langOption)
        changeValue(p.language, p.langOption.value);

      p.inputs.forEach((input, i) => {
        if (!input.isConnected)
          throw Error(
            'LEAP refreshed the form. Load the student again.'
          );

        changeValue(input, p.subject.parts[i]);
      });
    }

    // Verify that the form accepted every value.
    for (const p of plans) {
      p.inputs.forEach((input, i) => {
        if (
          !input.isConnected ||
          Number(input.value) !== p.subject.parts[i]
        ) {
          throw Error(
            'Please check the entered marks for ' +
            p.subject.name
          );
        }
      });
    }

    fillStatus.textContent = '✓ ' +
      packet.exam.replace(/^(FA|SA)([1-4])$/, '$1-$2') +
      ' marks filled for ' + record.name + '.';

  } catch (error) {
    fillStatus.textContent =
      '⚠ ' + error.message;
  }
};

box.append(title, info, fillBtn, clear, fillStatus);
  document.body.appendChild(box);

// ---------- AUTO SELECT LEAP DETAILS ----------

const autoStatus = document.createElement('div');
autoStatus.style.cssText =
  'margin-top:10px;font-size:15px;color:#087c47';

box.appendChild(autoStatus);

const autoNorm = x => String(x || '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

const autoDelay = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function autoSelectLEAP() {

  const houseMap = {
  GREENHOUSE: 'A',
  YELLOWHOUSE: 'B',
  REDHOUSE: 'C'
};

const sectionName = String(packet.sectionName || '')
  .toUpperCase()
  .replace(/[^A-Z]/g, '');

const section = houseMap[sectionName] ||
  sectionName.charAt(0);

  const grade = Number(packet.grade);

  const fields = [
    {
      name: 'View Type',
      values: ['CLASSTEACHER']
    },
    {
      name: 'Academic Year',
      values: [autoNorm(packet.year)]
    },
    {
      name: 'Exam',
      values: [
        autoNorm(packet.exam),
        'FORMATIVEASSESSMENT' +
          String(packet.exam).replace(/\D/g, '')
      ]
    },
    {
      name: 'Medium',
      values: ['ENGLISH', 'ENGLISHMEDIUM']
    },
    {
      name: 'Class & Section',
      values: [
        grade + section,
        grade + 'TH' + section,
        grade + 'THCLASS' + section
      ]
    }
  ];

  for (const field of fields) {

    let completed = false;

    for (let attempt = 0; attempt < 40; attempt++) {

      const selects = Array.from(
        document.querySelectorAll('select')
      ).filter(s => !s.closest('table'));

      const matches = [];

      for (const select of selects) {

        const option = Array.from(
          select.options
        ).find(o =>
          !o.disabled &&
          field.values.includes(autoNorm(o.text))
        );

        if (option && !select.disabled) {
          matches.push({ select, option });
        }
      }

      if (matches.length > 1) {
        throw Error(
          'Multiple dropdowns match ' + field.name
        );
      }

      if (matches.length === 1) {

        const { select, option } = matches[0];

        if (select.value !== option.value) {

          const setter =
            Object.getOwnPropertyDescriptor(
              HTMLSelectElement.prototype,
              'value'
            ).set;

          setter.call(select, option.value);

          select.dispatchEvent(
            new Event('input', { bubbles: true })
          );

          select.dispatchEvent(
            new Event('change', { bubbles: true })
          );
        }

        await autoDelay(400);

        if (select.value === option.value) {
          completed = true;
          break;
        }
      }

      await autoDelay(250);
    }

    if (!completed) {
      throw Error(
        'Could not automatically select ' + field.name
      );
    }
  }

  autoStatus.textContent =
    '✓ LEAP details selected automatically. ' +
    'Select the student and tap Get Details.';
}

// Automatically handle LEAP's dependent dropdown loading.
// ---------- MANUAL FILL DETAILS BUTTON ----------

const detailsBtn = document.createElement('button');

detailsBtn.textContent = 'Fill Details';
detailsBtn.type = 'button';

detailsBtn.style.cssText =
  'margin:8px;padding:12px;' +
  'background:#145b91;color:white;' +
  'border:0;border-radius:7px;' +
  'font-size:15px;font-weight:bold;';

box.insertBefore(detailsBtn, fillBtn);

// ---------- RETURN TO SCHOOL APP ----------
const backToAppBtn = document.createElement('button');

backToAppBtn.type = 'button';
backToAppBtn.textContent = 'Back to School App';

backToAppBtn.style.cssText =
  'margin:8px;padding:12px;' +
  'background:#374151;color:white;' +
  'border:0;border-radius:7px;' +
  'font-size:14px;font-weight:bold;';

backToAppBtn.onclick = () => {
  if (!confirm(
    'Return to School App? Make sure the current marks are saved.'
  )) return;

  GM_deleteValue(KEY);

  window.location.replace(
    'https://messiahsastry.github.io/Question-Bank/excel.html'
  );
};

box.insertBefore(backToAppBtn, clear);

// Large, floating, two-column controls for mobile screens.
const actionGrid = document.createElement('div');
actionGrid.style.cssText =
  'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));' +
  'gap:13px;margin:14px 0 7px;';

function styleLargeAction(button, background, foreground = '#fff') {
  button.style.cssText =
    'width:100%;min-height:86px;padding:18px 12px;margin:0;' +
    'display:flex;align-items:center;justify-content:center;' +
    'box-sizing:border-box;border:1px solid rgba(0,0,0,.06);' +
    'border-radius:16px;' +
    'background:' + background + ';color:' + foreground + ';' +
    'font:800 20px/1.25 system-ui,-apple-system,Arial,sans-serif;' +
    'letter-spacing:.1px;' +
    'box-shadow:0 5px 12px rgba(15,23,42,.15);' +
    'white-space:normal;text-align:center;overflow-wrap:anywhere;' +
    'touch-action:manipulation;cursor:pointer;';
}

styleLargeAction(detailsBtn, '#145b91');
styleLargeAction(fillBtn, '#087c47');
styleLargeAction(backToAppBtn, '#374151');
styleLargeAction(clear, '#e5e7eb', '#111827');

actionGrid.append(detailsBtn, fillBtn, backToAppBtn, clear);
box.insertBefore(actionGrid, fillStatus);

function getLEAPFields() {
  return Array.from(
    document.querySelectorAll('select')
  ).filter(s => !s.closest('table'));
}

async function selectLEAPField(index, name, values) {

  const acceptable = values.map(autoNorm);

  for (let attempt = 0; attempt < 65; attempt++) {

    const fields = getLEAPFields();
    const select = fields[index];

    if (select && !select.disabled) {

      const option = Array.from(select.options)
        .find(o =>
          !o.disabled &&
          (
            acceptable.includes(autoNorm(o.text)) ||
            acceptable.includes(autoNorm(o.value))
          )
        );

      if (option) {

        if (select.value !== option.value) {

          const setter =
            Object.getOwnPropertyDescriptor(
              HTMLSelectElement.prototype,
              'value'
            ).set;

          setter.call(select, option.value);

          select.dispatchEvent(
            new Event('input', { bubbles: true })
          );

          select.dispatchEvent(
            new Event('change', { bubbles: true })
          );
        }

        await autoDelay(500);

        if (
          select.isConnected &&
          select.value === option.value
        ) {
          return;
        }
      }
    }

    await autoDelay(250);
  }

  throw new Error(
    'Unable to select ' + name
  );
}

detailsBtn.onclick = async () => {

  detailsBtn.disabled = true;

  try {

    autoStatus.textContent =
      'Selecting LEAP details...';

    const year = autoNorm(packet.year);

    const years = [year];

    if (/^\d{6}$/.test(year)) {
      years.push(
        year.slice(0, 4) +
        '20' +
        year.slice(4)
      );
    }

    if (/^\d{8}$/.test(year)) {
      years.push(
        year.slice(0, 4) +
        year.slice(-2)
      );
    }

    const grade = Number(packet.grade);

    const houseMap = {
      GREENHOUSE: 'A',
      YELLOWHOUSE: 'B',
      REDHOUSE: 'C'
    };
    const sectionName = String(packet.sectionName || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
    const section = houseMap[sectionName] || sectionName.charAt(0);

    const exam = autoNorm(packet.exam);

    const examNumber =
      String(packet.exam).replace(/\D/g, '');

    // 1. VIEW TYPE
    autoStatus.textContent =
      'Selecting Class Teacher...';

    await selectLEAPField(
      0,
      'View Type',
      ['Class Teacher']
    );

    await autoDelay(1000);

    // 2. ACADEMIC YEAR
    autoStatus.textContent =
      'Selecting Academic Year...';

    await selectLEAPField(
      1,
      'Academic Year',
      years
    );

    await autoDelay(700);

    // 3. EXAM
    autoStatus.textContent =
      'Selecting Examination...';

    await selectLEAPField(
      2,
      'Examination',
      [
        exam,
        (packet.exam === 'SA1' ? 'SUMMATIVEASSESSMENT' :
          'FORMATIVEASSESSMENT') + examNumber
      ]
    );

    await autoDelay(700);

    // 4. MEDIUM
    autoStatus.textContent =
      'Selecting English Medium...';

    await selectLEAPField(
      3,
      'Medium',
      ['English', 'English Medium']
    );

    await autoDelay(700);

    // 5. CLASS & SECTION
    autoStatus.textContent =
      'Selecting Class & Section...';

    await selectLEAPField(
      4,
      'Class & Section',
      [
        grade + section,
        grade + 'TH' + section,
        grade + 'THCLASS' + section,
        grade + 'THCLASS' + section + 'SECTION',
        grade + 'CLASS' + section,
        'CLASS' + grade + section
      ]
    );

    autoStatus.textContent =
      '✓ Details selected. Please select the student.';

  } catch (error) {

    autoStatus.textContent =
      '⚠ ' + error.message;

  } finally {

    detailsBtn.disabled = false;
  }
};

// Disable the earlier automatic startup.
(async function startLEAPSelection() {
  return;

  for (let attempt = 1; attempt <= 3; attempt++) {

    try {
      autoStatus.textContent =
        'Selecting LEAP details automatically...';

      await autoSelectLEAP();

      autoStatus.textContent =
        '✓ LEAP details selected. Please select the student.';

      return;

    } catch (error) {

      if (attempt === 3) {
        autoStatus.textContent =
          '⚠ ' + error.message +
          '. Please check the LEAP dropdowns.';
        return;
      }

      // Allow LEAP to finish loading dependent dropdowns.
      await autoDelay(1800);
    }
  }

})();
})();
