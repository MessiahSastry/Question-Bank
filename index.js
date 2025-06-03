// ====== FIREBASE SETUP ======
const firebaseConfig = {
  apiKey: "AIzaSyAszVhWXUUOYLQ7VimKmPKf1yEu_CI9RCE",
  authDomain: "stpatricks-questionbank.firebaseapp.com",
  projectId: "stpatricks-questionbank",
  storageBucket: "stpatricks-questionbank.appspot.com",
  messagingSenderId: "917615322861",
  appId: "1:917615322861:web:c6c890aa2184dd395b8ee4"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ====== SECTION NAVIGATION ======
function showSection(id, pushState = true) {
  document.querySelectorAll('.app-section').forEach(sec => sec.style.display = 'none');
  document.getElementById(id).style.display = 'block';
  if (pushState) {
    history.pushState({ section: id }, '', '');
  }
}

// ====== SPLASH AND LOGIN ======
const splash = document.getElementById('splash');
const loginSection = document.getElementById('login-section');

function hideSplashAndShowLogin() {
  if (splash) splash.classList.add('hidden');
  showSection('login-section');
}

function showLoginUI() {
  loginSection.innerHTML = `
    <div class="login-box">
      <header class="dashboard-header">
  <div class="school-title">ST. PATRICK'S SCHOOL</div>
  <div class="subtitle-row">
    <div class="subtitle">IIT & NEET FOUNDATION</div>
  </div>
</header>
      <input type="email" id="email" placeholder="Email" autocomplete="username" />
      <input type="password" id="password" placeholder="Password" autocomplete="current-password" />
      <div class="forgot-row">
        <button type="button" onclick="forgotPassword()">Forgot Password?</button>
      </div>
      <button class="btn-email" onclick="emailSignIn()">Sign in with Email</button>
      <button class="btn-register" onclick="emailRegister()">Register (New User)</button>
      <button class="btn-google" onclick="googleSignIn()">
        <i class="fab fa-google"></i> Sign in with Google
      </button>
    </div>
  `;
  showSection('login-section');
}

// ====== AUTH FUNCTIONS ======
window.emailSignIn = function () {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!email || !password) return alert('Enter email and password!');
  auth.signInWithEmailAndPassword(email, password)
    .then(() => showSection('dashboard-section'))
    .catch(err => alert(err.message));
};

window.emailRegister = function () {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!email || !password) return alert('Enter email and password!');
  auth.createUserWithEmailAndPassword(email, password)
    .then(() => {
      alert("Registration successful! You are now signed in.");
      showSection('dashboard-section');
    })
    .catch(err => alert(err.message));
};

window.googleSignIn = function () {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(() => showSection('dashboard-section'))
    .catch(err => alert(err.message));
};

window.forgotPassword = function () {
  const email = document.getElementById('email').value.trim();
  if (!email) return alert('Enter your email to reset password.');
  auth.sendPasswordResetEmail(email)
    .then(() => alert("Password reset email sent."))
    .catch(err => alert(err.message));
};

// ====== AUTH STATE HANDLING ======
auth.onAuthStateChanged(function (user) {
  setTimeout(() => {
    if (splash) splash.classList.add('hidden');
    if (user) {
      showSection('dashboard-section');
      history.replaceState({ section: 'dashboard-section' }, '', '');
      loadDashboard();
    } else {
      showLoginUI();
    }
  }, 1000);
});

window.onload = function () {
  setTimeout(() => {
    if (splash && !splash.classList.contains('hidden')) {
      hideSplashAndShowLogin();
      showLoginUI();
    }
  }, 2000);
};

// ====== DASHBOARD LOGIC ======
function loadDashboard() {
  const displayNameSpan = document.getElementById("display-name");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsPopup = document.getElementById("settings-popup");
  const editNameInput = document.getElementById("edit-name");
  const saveNameBtn = document.getElementById("save-name-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const closeSettingsBtn = document.getElementById("close-settings-btn");
  const fasaBtn = document.getElementById("fasa-btn");

  let user = auth.currentUser;
  let userDisplayName = "";

  db.collection("users").doc(user.uid).get().then(doc => {
    userDisplayName = doc.exists ? (doc.data().displayName || "") : (user.displayName || "");
    displayNameSpan.textContent = userDisplayName || user.email;

    if (fasaBtn) {
      const isAdmin = doc.exists ? !!doc.data().admin : false;
      if (!isAdmin) {
        fasaBtn.classList.add("locked");
        fasaBtn.onclick = () => {
          alert("Only admins can access the FA/SA Builder.\nIf you need access, contact your school administrator.");
        };
      } else {
        fasaBtn.classList.remove("locked");
        fasaBtn.onclick = () => {
          alert("FA/SA Builder coming soon!");
        };
      }
    }
  });

  settingsBtn.onclick = function () {
    settingsPopup.style.display = "flex";
    editNameInput.value = userDisplayName || "";
    editNameInput.focus();
  };
  closeSettingsBtn.onclick = function () {
    settingsPopup.style.display = "none";
  };

  saveNameBtn.onclick = async () => {
    const newName = editNameInput.value.trim();
    if (!newName) return alert("Please enter your name.");
    try {
      await db.collection("users").doc(user.uid).set({ displayName: newName }, { merge: true });
      if (user.displayName !== newName) {
        await user.updateProfile({ displayName: newName });
      }
      userDisplayName = newName;
      displayNameSpan.textContent = userDisplayName;
      settingsPopup.style.display = "none";
      alert("Name updated!");
    } catch (e) {
      alert("Failed to save name. Try again.");
    }
  };

  logoutBtn.onclick = () => {
    auth.signOut().then(() => {
      showSection('login-section');
      history.replaceState({ section: 'login-section' }, '', '');
    });
  };

  settingsPopup.addEventListener("click", (e) => {
    if (e.target === settingsPopup) settingsPopup.style.display = "none";
  });

  document.getElementById("gen-ai-btn").onclick = function () {
    showSection('ai-question-section');
  };
  document.getElementById("manual-add-btn").onclick = function () {
    showSection('manual-question-section');
  };
  document.getElementById("qbank-btn").onclick = function () {
    showSection('qbank-section');
    loadQuestionBank();
  };
  document.getElementById("sliptest-btn").onclick = function () {
    alert("Slip Test Paper Builder coming soon!");
  };
  document.getElementById("textbooks-btn").onclick = function () {
    alert("AP Textbook Viewer coming soon!");
  };
}

// ====== AI QUESTION GENERATOR LOGIC ======
const outputDiv = document.getElementById("output");
const saveAllBtn = document.getElementById("saveAllBtn");
let questions = [];

if (document.getElementById("genForm")) {
  document.getElementById("genForm").onsubmit = async function (e) {
    e.preventDefault();
    outputDiv.innerHTML = "Generating questions, please wait...";
    saveAllBtn.style.display = "none";
    questions = [];

    const form = e.target;
    const data = {
      class: form.class.value,
      subject: form.subject.value,
      chapter: form.chapter.value,
      prompt: form.prompt.value,
    };
    const fullPrompt =
      `Generate questions for class ${data.class}, subject ${data.subject}, chapter "${data.chapter}".\n` +
      `Format each question EXACTLY like this:\n` +
      `Question 1: (Easy, 2 Marks)\nThe question starts from here and can run into a second line if needed.\n\n` +
      `Question 2: (Difficult, 4 Marks)\nThe question starts from here.\n\n` +
      `- Use this format for all questions: 'Question X: (Difficulty, Marks)' on the first line (no extra symbols or Markdown), followed by the question itself starting on the next line.\n` +
      `- Do not use Markdown or extra hashes (###), just plain text as shown.\n` +
      `- The difficulty should match the requested difficulty.\n` +
      (data.prompt && data.prompt.trim() !== "" ? `Instructions/keywords: ${data.prompt}\n` : "") +
      "Only give questions (NO solutions/answers).";
    try {
      const response = await fetch("https://question-bank-lqsu.onrender.com/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt }),
      });
      const result = await response.json();
      if (result.error) {
        outputDiv.innerHTML = "Error: " + result.error;
        return;
      }
      const items = result.result.split(/(?=Question \d+:)/g).filter(q => q.trim());
      questions = items.map(q => ({ text: q.trim() }));
      renderQuestions();
    } catch (err) {
      outputDiv.innerHTML = "Request failed. " + err;
    }
  };

  function renderQuestions() {
    outputDiv.innerHTML = "";
    questions.forEach((q, idx) => {
      const card = document.createElement("div");
      card.className = "question-card";
      card.dataset.idx = idx;

      const qText = document.createElement("div");
      qText.className = "question-text";
      qText.contentEditable = false;
      let match = q.text.match(/^(Question\s*\d+:\s*\([^)]+\))\s*(.+)$/s);
      if (match) {
        qText.innerHTML = `
          <span class="q-meta">${match[1]}</span>
          <span class="q-body">${match[2]}</span>
        `;
      } else {
        qText.innerHTML = `<span class="q-body">${q.text}</span>`;
      }
      card.appendChild(qText);

      const btnGroup = document.createElement("div");
      btnGroup.className = "btn-group";

      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.className = "btn-small edit-btn";
      editBtn.onclick = () => {
        if (qText.contentEditable === "true") {
          qText.contentEditable = false;
          q.text = qText.innerText.replace(/^Q\d+\.\s*/, "").trim();
          editBtn.textContent = "Edit";
          if (window.MathJax) window.MathJax.typesetPromise();
        } else {
          qText.contentEditable = true;
          qText.focus();
          editBtn.textContent = "Save";
        }
      };
      btnGroup.appendChild(editBtn);

      const copyBtn = document.createElement("button");
      copyBtn.textContent = "Copy";
      copyBtn.className = "btn-small copy-btn";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(q.text).then(() => {
          alert("Question copied to clipboard");
        });
      };
      btnGroup.appendChild(copyBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.className = "btn-small delete-btn";
      deleteBtn.onclick = () => {
        if (confirm("Are you sure you want to delete this question?")) {
          questions.splice(idx, 1);
          renderQuestions();
          if (questions.length === 0) saveAllBtn.style.display = "none";
        }
      };
      btnGroup.appendChild(deleteBtn);

      card.appendChild(btnGroup);
      outputDiv.appendChild(card);
    });
    if (questions.length > 0) {
      saveAllBtn.style.display = "block";
    } else {
      saveAllBtn.style.display = "none";
    }
    if (window.MathJax) window.MathJax.typesetPromise();
  }

  saveAllBtn.onclick = async () => {
    if (!auth.currentUser) {
      alert("Please login to save questions.");
      return;
    }
    saveAllBtn.disabled = true;
    saveAllBtn.textContent = "Saving...";

    const form = document.getElementById("genForm");
    const classVal = form.class.value;
    const subjectVal = form.subject.value;
    const chapterVal = form.chapter.value;
    const userId = auth.currentUser.uid;

    let savedCount = 0, skippedCount = 0;

    for (const q of questions) {
      const querySnapshot = await db.collection("questions")
        .where("createdBy", "==", userId)
        .where("class", "==", classVal)
        .where("subject", "==", subjectVal)
        .where("chapter", "==", chapterVal)
        .where("text", "==", q.text)
        .get();

      if (!querySnapshot.empty) {
        skippedCount++;
        continue;
      }
      await db.collection("questions").add({
        text: q.text,
        createdBy: userId,
        class: classVal,
        subject: subjectVal,
        chapter: chapterVal,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
      savedCount++;
    }

    alert(
      `Saved ${savedCount} new question${savedCount !== 1 ? 's' : ''}.`
      + (skippedCount > 0 ? ` Skipped ${skippedCount} duplicate${skippedCount !== 1 ? 's' : ''}.` : "")
    );
    saveAllBtn.textContent = "Save All Questions";
    saveAllBtn.disabled = false;
  };
}

// ====== QUESTION BANK LOGIC ======
function loadQuestionBank() {
  const classFilter = document.getElementById("class-filter");
  const subjectFilter = document.getElementById("subject-filter");
  const chapterFilter = document.getElementById("chapter-filter");
  const outputDiv = document.getElementById("qb-output");

  let qbQuestions = [];
  let filteredQuestions = [];

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      showSection('login-section');
      return;
    }
    let snapshot = await db.collection("questions")
      .where("createdBy", "==", user.uid)
      .orderBy("timestamp", "desc")
      .get();

    qbQuestions = [];
    snapshot.forEach(doc => {
      let q = doc.data();
      q.id = doc.id;
      qbQuestions.push(q);
    });

    setFilterOptions();
    filteredQuestions = [];
    renderQuestions(filteredQuestions);
  });

  function setFilterOptions() {
    let classes = new Set(), subjects = new Set();
    let subjectToChapters = {};

    qbQuestions.forEach(q => {
      if (q.class) classes.add(q.class);
      if (q.subject) subjects.add(q.subject);
      if (q.chapter) {
        if (!subjectToChapters[q.subject]) subjectToChapters[q.subject] = new Set();
        subjectToChapters[q.subject].add(q.chapter);
      }
    });

    function setOptions(select, items, label) {
      select.innerHTML = `<option value="">${label}</option>`;
      Array.from(items).sort().forEach(val => {
        select.innerHTML += `<option value="${val}">${val}</option>`;
      });
    }
    setOptions(classFilter, classes, "Class");
    setOptions(subjectFilter, subjects, "Subject");

    let initialChapters = new Set();
    Object.values(subjectToChapters).forEach(chapSet => {
      chapSet.forEach(c => initialChapters.add(c));
    });
    setOptions(chapterFilter, initialChapters, "Chapter");

    subjectFilter.onchange = function () {
      let subj = subjectFilter.value;
      let chapterSet = subj && subjectToChapters[subj] ? subjectToChapters[subj] : [];
      setOptions(chapterFilter, chapterSet, "Chapter");
      filterQuestions();
    };
    chapterFilter.onchange = function () {
      filterQuestions();
    };
  }
  function filterQuestions() {
    let classVal = classFilter.value.trim();
    let subjectVal = subjectFilter.value.trim();
    let chapterVal = chapterFilter.value.trim();

    filteredQuestions = qbQuestions.filter(q => {
      if (classVal && (!q.class || q.class.trim() !== classVal)) return false;
      if (subjectVal && (!q.subject || q.subject.trim() !== subjectVal)) return false;
      if (chapterVal && (!q.chapter || q.chapter.trim() !== chapterVal)) return false;
      return true;
    });
    renderQuestions(filteredQuestions);
  }
  function renderQuestions(list) {
    outputDiv.innerHTML = "";
    list.forEach((q, idx) => {
      let match = q.text.match(/^Question\s*(\d+):\s*\(([^)]+)\)\s*([\s\S]+)/i);
      let displayText = "";
      if (match) {
        displayText = `Q${match[1]}. ${match[3].trim()} (${match[2].trim()})`;
      } else {
        displayText = `Q${idx + 1}. ${q.text}`;
      }
      const div = document.createElement("div");
      div.style.marginBottom = "18px";
      div.style.fontSize = "1.14em";
      div.style.background = "#f7fafd";
      div.style.borderRadius = "8px";
      div.style.padding = "14px 16px";
      div.style.boxShadow = "0 2px 8px #0f3d6b09";
      div.textContent = displayText;
      outputDiv.appendChild(div);
    });
  }
  [classFilter, subjectFilter, chapterFilter].forEach(sel => {
    sel.addEventListener("change", filterQuestions);
  });
}

// ====== MANUAL QUESTION ENTRY LOGIC ======
(() => {
  const manualClass = document.getElementById('manual-class');
  const manualSubject = document.getElementById('manual-subject');
  const manualChapter = document.getElementById('manual-chapter');
  const manualFile = document.getElementById('manual-file');
  const manualFilePreview = document.getElementById('manual-file-preview');
  const manualExtractBtn = document.getElementById('manual-extract-btn');
  const ocrLoading = document.getElementById('ocr-loading');
  const manualReviewForm = document.getElementById('manual-review-form');
  const manualQuestionsList = document.getElementById('manual-questions-list');
  const manualSuccessMsg = document.getElementById('manual-success-msg');

  let currentPageNumber = 1;
  let pdfDoc = null;
  let currentImageDataUrl = null;
  let detectedQuestions = [];

  function resetManualUI() {
    manualFilePreview.innerHTML = "";
    manualExtractBtn.style.display = "none";
    ocrLoading.style.display = "none";
    manualReviewForm.style.display = "none";
    manualQuestionsList.innerHTML = "";
    manualSuccessMsg.style.display = "none";
    detectedQuestions = [];
    pdfDoc = null;
    currentPageNumber = 1;
    currentImageDataUrl = null;
  }

  manualFile.addEventListener('change', async () => {
    resetManualUI();
    const file = manualFile.files[0];
    if (!file) return;
    const fileType = file.type;
    if (fileType === "application/pdf") {
      const fileReader = new FileReader();
      fileReader.onload = async function () {
        const typedarray = new Uint8Array(this.result);
        pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
        currentPageNumber = 1;
        renderPdfPage(currentPageNumber);
        manualExtractBtn.style.display = "inline-block";
      };
      fileReader.readAsArrayBuffer(file);
    } else if (fileType.startsWith("image/")) {
      const imgURL = URL.createObjectURL(file);
      manualFilePreview.innerHTML = `<img id="manual-img-preview" src="${imgURL}" style="max-width:100%; max-height:360px; border-radius:8px;"/>`;
      currentImageDataUrl = imgURL;
      manualExtractBtn.style.display = "inline-block";
    } else {
      alert("Unsupported file type. Please upload an image or PDF.");
      manualFile.value = "";
    }
  });

  async function renderPdfPage(num) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    manualFilePreview.innerHTML = "";
    manualFilePreview.appendChild(canvas);
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    currentImageDataUrl = canvas.toDataURL();
  }

  manualExtractBtn.onclick = async () => {
    if (!currentImageDataUrl) {
      alert("No file or page to extract from.");
      return;
    }
    manualExtractBtn.disabled = true;
    ocrLoading.style.display = "block";
    manualReviewForm.style.display = "none";
    manualQuestionsList.innerHTML = "";
    detectedQuestions = [];

    try {
      const result = await Tesseract.recognize(
        currentImageDataUrl,
        'eng',
        { logger: m => {/* Optional logging */} }
      );
      let text = result.data.text;
      const questionRegex = /(?:^|\n)(?:Q(?:uestion)?\s*\d+|[0-9]{1,2}[.)])\s*/gi;
      let splitIndices = [];
      let match;
      while ((match = questionRegex.exec(text)) !== null) {
        splitIndices.push(match.index);
      }
      splitIndices.push(text.length);
      for (let i = 0; i < splitIndices.length - 1; i++) {
        let questionText = text.substring(splitIndices[i], splitIndices[i + 1]).trim();
        questionText = questionText.replace(/Answer[s]?:[\s\S]*$/i, "").trim();
        questionText = questionText.replace(/Ans[:.]?[\s\S]*$/i, "").trim();

        if (questionText) {
          let tag = { difficulty: "Medium", marks: 4 };
          try {
            const response = await fetch("/tag-question", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ question: questionText }),
            });
            if (response.ok) tag = await response.json();
          } catch {
            console.warn("Tagging API failed, using defaults");
          }
          detectedQuestions.push({
            text: questionText,
            difficulty: tag.difficulty || "Medium",
            marks: tag.marks || 4,
            selected: true,
          });
        }
      }
      if (detectedQuestions.length === 0) {
        alert("No questions detected. Please check the image or PDF page.");
        manualExtractBtn.disabled = false;
        ocrLoading.style.display = "none";
        return;
      }
      renderManualQuestions();
      manualReviewForm.style.display = "block";
    } catch (e) {
      alert("OCR failed: " + e.message);
    } finally {
      ocrLoading.style.display = "none";
      manualExtractBtn.disabled = false;
    }
  };

  function renderManualQuestions() {
    manualQuestionsList.innerHTML = "";
    detectedQuestions.forEach(q => {
      const div = document.createElement('div');
      div.className = 'manual-question-card';
      div.style.border = '1.5px solid #1762a7';
      div.style.borderRadius = '12px';
      div.style.padding = '14px 16px';
      div.style.marginBottom = '14px';
      div.style.background = '#f7fafd';
      div.style.fontSize = '1.03em';
      div.style.position = 'relative';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = q.selected;
      checkbox.style.position = 'absolute';
      checkbox.style.top = '12px';
      checkbox.style.left = '12px';
      checkbox.onchange = () => { q.selected = checkbox.checked; };
      div.appendChild(checkbox);

      const textarea = document.createElement('textarea');
      textarea.value = q.text;
      textarea.style.width = 'calc(100% - 40px)';
      textarea.style.marginLeft = '40px';
      textarea.rows = 3;
      textarea.oninput = () => { q.text = textarea.value; };
      div.appendChild(textarea);

      const diffLabel = document.createElement('label');
      diffLabel.textContent = "Difficulty:";
      diffLabel.style.marginRight = "8px";
      diffLabel.style.marginLeft = "40px";
      diffLabel.style.fontWeight = "600";
      diffLabel.style.fontSize = "0.95em";

      const diffSelect = document.createElement('select');
      ['Easy', 'Medium', 'Difficult'].forEach(level => {
        const opt = document.createElement('option');
        opt.value = level;
        opt.textContent = level;
        if (level === q.difficulty) opt.selected = true;
        diffSelect.appendChild(opt);
      });
      diffSelect.style.marginRight = "20px";
      diffSelect.onchange = () => { q.difficulty = diffSelect.value; };
      div.appendChild(diffLabel);
      div.appendChild(diffSelect);

      const marksLabel = document.createElement('label');
      marksLabel.textContent = "Marks:";
      marksLabel.style.fontWeight = "600";
      marksLabel.style.fontSize = "0.95em";

      const marksSelect = document.createElement('select');
      [1, 2, 4, 6, 8, 10].forEach(mark => {
        const opt = document.createElement('option');
        opt.value = mark;
        opt.textContent = mark;
        if (mark === q.marks) opt.selected = true;
        marksSelect.appendChild(opt);
      });
      marksSelect.onchange = () => { q.marks = parseInt(marksSelect.value); };
      div.appendChild(marksLabel);
      div.appendChild(marksSelect);

      manualQuestionsList.appendChild(div);
    });
  }

  manualReviewForm.onsubmit = async e => {
    e.preventDefault();
    if (!auth.currentUser) {
      alert("Please login to save questions.");
      return;
    }
    const classVal = manualClass.value.trim();
    const subjectVal = manualSubject.value.trim();
    const chapterVal = manualChapter.value.trim();
    const userId = auth.currentUser.uid;

    const questionsToSave = detectedQuestions.filter(q => q.selected && q.text.trim().length > 3);
    if (questionsToSave.length === 0) {
      alert("Please select at least one valid question to save.");
      return;
    }

    try {
      let savedCount = 0, skippedCount = 0;
      for (const q of questionsToSave) {
        const existingQuery = await db.collection("questions")
          .where("createdBy", "==", userId)
          .where("class", "==", classVal)
          .where("subject", "==", subjectVal)
          .where("chapter", "==", chapterVal)
          .where("text", "==", q.text.trim())
          .get();

        if (!existingQuery.empty) {
          skippedCount++;
          continue;
        }

        await db.collection("questions").add({
          text: q.text.trim(),
          createdBy: userId,
          class: classVal,
          subject: subjectVal,
          chapter: chapterVal,
          difficulty: q.difficulty,
          marks: q.marks,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
        savedCount++;
      }
      manualReviewForm.style.display = "none";
      manualSuccessMsg.style.display = "block";
      manualFile.value = "";
      resetManualUI();

      alert(`Saved ${savedCount} new question${savedCount !== 1 ? 's' : ''}.` +
        (skippedCount > 0 ? ` Skipped ${skippedCount} duplicate${skippedCount !== 1 ? 's' : ''}.` : ""));
    } catch (err) {
      alert("Failed to save questions: " + err.message);
    }
  };

  const manualSection = document.getElementById('manual-question-section');
  new MutationObserver(() => {
    if (manualSection.style.display === "block") {
      resetManualUI();
      manualClass.value = "";
      manualSubject.value = "";
      manualChapter.value = "";
      manualFile.value = "";
    }
  }).observe(manualSection, { attributes: true, attributeFilter: ['style'] });

})();
