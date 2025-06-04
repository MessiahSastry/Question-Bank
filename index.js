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
     <div class="login-header">
      <div class="login-title">ST. PATRICK'S SCHOOL</div>
      <div class="login-subtitle">IIT & NEET FOUNDATION</div>
      </div>
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
      div.innerHTML = displayText;
      outputDiv.appendChild(div);
    });
    if (window.MathJax) window.MathJax.typesetPromise();
  }
  [classFilter, subjectFilter, chapterFilter].forEach(sel => {
    sel.addEventListener("change", filterQuestions);
  });
}

// ====== MANUAL QUESTION ENTRY LOGIC (REVISED) ======
(() => {
  const manualForm = document.getElementById('manualMetaForm');
  const manualClass = document.getElementById('manual-class');
  const manualSubject = document.getElementById('manual-subject');
  const manualChapter = document.getElementById('manual-chapter');
  const manualSuccessMsg = document.getElementById('manual-success-msg');

  if (!manualForm) return;
  manualForm.onsubmit = (e) => {
  e.preventDefault();

  // Gather input values
  const classVal = manualClass.value.trim();
  const subjectVal = manualSubject.value.trim();
  const chapterVal = manualChapter.value.trim();
  const mathfield = document.getElementById('manual-question-mathfield');
  const questionText = mathfield.getValue('latex-expanded').trim();
// Show preview instead of saving immediately
  showManualPreview({
    classVal,
    subjectVal,
    chapterVal,
    questionText
  });
};

// Add this helper function (also inside your IIFE, just after the submit handler)
function showManualPreview({ classVal, subjectVal, chapterVal, questionText }) {
  // Create preview box
  let previewBox = document.createElement("div");
  previewBox.style.position = "fixed";
  previewBox.style.left = "0"; previewBox.style.top = "0";
  previewBox.style.width = "100vw"; previewBox.style.height = "100vh";
  previewBox.style.background = "rgba(18,34,50,0.14)";
  previewBox.style.display = "flex";
  previewBox.style.alignItems = "center";
  previewBox.style.justifyContent = "center";
  previewBox.style.zIndex = "99999";

  let inner = document.createElement("div");
  inner.style.background = "#fff";
  inner.style.borderRadius = "16px";
  inner.style.padding = "30px 26px";
  inner.style.boxShadow = "0 6px 32px #0f3d6b2c";
  inner.style.minWidth = "320px";
  inner.style.maxWidth = "98vw";
  inner.style.textAlign = "left";

  inner.innerHTML = `
    <h2 style="text-align:center; margin-bottom:20px;">Preview Question</h2>
    <div id="manual-question-preview" style="font-size:1.18em; color:#12416c; margin-bottom:22px;">
      ${questionText}
    </div>
    <button id="manual-confirm-btn" class="btn" style="width:100%;margin-bottom:7px;">Confirm Save</button>
    <button id="manual-edit-btn" class="btn" style="background:#bcd6ef; color:#185496;width:100%;">Edit</button>
  `;

  previewBox.appendChild(inner);
  document.body.appendChild(previewBox);

  // Render MathJax in preview
  if (window.MathJax) window.MathJax.typesetPromise([inner.querySelector("#manual-question-preview")]);

  // Handle Confirm/Cancel
  inner.querySelector("#manual-confirm-btn").onclick = async () => {
    // Save to Firestore as before
    if (!auth.currentUser) {
      alert("Please login to save questions.");
      return;
    }
    const userId = auth.currentUser.uid;

    // Duplicate check
    const existingQuery = await db.collection("questions")
      .where("createdBy", "==", userId)
      .where("class", "==", classVal)
      .where("subject", "==", subjectVal)
      .where("chapter", "==", chapterVal)
      .where("text", "==", questionText)
      .get();

    if (!existingQuery.empty) {
      alert("Duplicate: This question already exists.");
      document.body.removeChild(previewBox);
      return;
    }
    await db.collection("questions").add({
      text: questionText,
      createdBy: userId,
      class: classVal,
      subject: subjectVal,
      chapter: chapterVal,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
    manualForm.reset();
    manualSuccessMsg.style.display = "block";
    setTimeout(() => {
      manualSuccessMsg.style.display = "none";
    }, 2000);

    alert("Question saved!");
    document.body.removeChild(previewBox);
  };
  inner.querySelector("#manual-edit-btn").onclick = () => {
    // Just close preview, return to editing
    document.body.removeChild(previewBox);
  };
}
// Reset success message and form on section open
  const manualSection = document.getElementById('manual-question-section');
  new MutationObserver(() => {
    if (manualSection.style.display === "block") {
      manualSuccessMsg.style.display = "none";
      manualForm.reset();
    }
  }).observe(manualSection, { attributes: true, attributeFilter: ['style'] });
})();
// Custom Dropdown Logic for Class & Subject (AI Question Generator)
document.addEventListener("DOMContentLoaded", function () {
  ["class", "subject"].forEach(function (type) {
    const dropdown = document.getElementById(type + "-dropdown");
    if (!dropdown) return;
    const selected = dropdown.querySelector(".selected-option");
    const options = dropdown.querySelector(".dropdown-options");
    const hiddenInput = dropdown.querySelector("input[type='hidden']");

    // Toggle dropdown
    selected.onclick = function () {
      dropdown.classList.toggle("open");
      options.style.display = dropdown.classList.contains("open") ? "block" : "none";
    };

    // Select option
    options.querySelectorAll("div").forEach(opt => {
      opt.onclick = function () {
        selected.textContent = opt.textContent;
        hiddenInput.value = opt.dataset.value;
        dropdown.classList.remove("open");
        options.style.display = "none";
      };
    });

    // Close on outside click
    document.addEventListener("click", function (e) {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove("open");
        options.style.display = "none";
      }
    });
  });
});
// Handle Mobile/Browser Back Button Navigation
window.addEventListener("popstate", function (event) {
  // Fallback to login if no section data
  let section = event.state && event.state.section ? event.state.section : "login-section";
  showSection(section, false);
});
// ---- Math Pasting Bridge ----
document.addEventListener("DOMContentLoaded", function () {
  const pasteBox = document.getElementById("plain-math-paste");
  const mathField = document.getElementById("manual-question-mathfield");
  if (!pasteBox || !mathField) return;

  pasteBox.addEventListener("paste", function (e) {
    setTimeout(() => {
      mathField.value = pasteBox.value;
      if (mathField.setValue) mathField.setValue(pasteBox.value);
    }, 50);
  });

  pasteBox.addEventListener("input", function () {
    mathField.value = pasteBox.value;
    if (mathField.setValue) mathField.setValue(pasteBox.value);
  });
});
// --- AI Convert Modal Logic ---
document.addEventListener("DOMContentLoaded", function () {
    const aiBtn = document.getElementById("ai-convert-btn");
    const modal = document.getElementById("ai-convert-modal");
    const plainInput = document.getElementById("plain-text-ai");
    const cancelBtn = document.getElementById("ai-convert-cancel");
    const doBtn = document.getElementById("ai-convert-do");
    const loader = document.getElementById("ai-convert-loader");
    const error = document.getElementById("ai-convert-error");
    const mathField = document.getElementById("manual-question-mathfield");

    if (!aiBtn || !modal) return;

    aiBtn.onclick = function () {
        modal.style.display = "flex";
        plainInput.value = "";
        loader.style.display = "none";
        error.style.display = "none";
    };
    cancelBtn.onclick = function () {
        modal.style.display = "none";
        loader.style.display = "none";
        error.style.display = "none";
    };

    doBtn.onclick = async function () {
        const plainText = plainInput.value.trim();
        if (!plainText) return;
        loader.style.display = "block";
        error.style.display = "none";

        try {
            const res = await fetch("/convert-math", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: plainText })
            });
            const data = await res.json();
            if (data.latex) {
                // Set to Mathlive input
                if (mathField.setValue) {
                    mathField.setValue(data.latex);
                }
                modal.style.display = "none";
            } else {
                error.style.display = "block";
                error.textContent = "Conversion failed. Please try again.";
            }
        } catch (e) {
            error.style.display = "block";
            error.textContent = "Error connecting to AI service.";
        }
        loader.style.display = "none";
    };
});
