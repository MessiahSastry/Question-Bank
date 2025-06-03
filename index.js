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
  // DOM references
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

  // Load user info and personalize dashboard
  db.collection("users").doc(user.uid).get().then(doc => {
    userDisplayName = doc.exists ? (doc.data().displayName || "") : (user.displayName || "");
    displayNameSpan.textContent = userDisplayName || user.email;

    // Role-based lock for FA/SA builder
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

  // Settings button opens popup
  settingsBtn.onclick = function() {
    settingsPopup.style.display = "flex";
    editNameInput.value = userDisplayName || "";
    editNameInput.focus();
  };
  closeSettingsBtn.onclick = function() {
    settingsPopup.style.display = "none";
  };

  // Save display name
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

  // Logout
  logoutBtn.onclick = () => {
   auth.signOut().then(() => {
  showSection('login-section');
  history.replaceState({ section: 'login-section' }, '', '');
    });
  };

  // Optional: Close popup if user clicks outside modal
  settingsPopup.addEventListener("click", (e) => {
    if (e.target === settingsPopup) settingsPopup.style.display = "none";
  });

  // HOOK UP DASHBOARD BUTTONS
  document.getElementById("gen-ai-btn").onclick = function() {
    showSection('ai-question-section');
  };
  document.getElementById("manual-add-btn").onclick = function() {
    alert("Manual Question Entry coming soon!");
  };
  document.getElementById("qbank-btn").onclick = function() {
    showSection('qbank-section');
    loadQuestionBank();
  };
  document.getElementById("sliptest-btn").onclick = function() {
    alert("Slip Test Paper Builder coming soon!");
  };
  document.getElementById("textbooks-btn").onclick = function() {
    alert("AP Textbook Viewer coming soon!");
  };
}

// ====== AI QUESTION GENERATOR LOGIC ======
const outputDiv = document.getElementById("output");
const saveAllBtn = document.getElementById("saveAllBtn");
let questions = [];

if (document.getElementById("genForm")) {
  document.getElementById("genForm").onsubmit = async function(e) {
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
      // Split questions by pattern
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

      // Edit button
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

      // Copy button
      const copyBtn = document.createElement("button");
      copyBtn.textContent = "Copy";
      copyBtn.className = "btn-small copy-btn";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(q.text).then(() => {
          alert("Question copied to clipboard");
        });
      };
      btnGroup.appendChild(copyBtn);

      // Delete button
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
  const difficultyFilter = document.getElementById("difficulty-filter");
  const marksFilter = document.getElementById("marks-filter");
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

  // Show all chapters if no subject selected
  let initialChapters = new Set();
  Object.values(subjectToChapters).forEach(chapSet => {
    chapSet.forEach(c => initialChapters.add(c));
  });
  setOptions(chapterFilter, initialChapters, "Chapter");

  // Update chapter dropdown based on subject selection
  subjectFilter.onchange = function () {
  let subj = subjectFilter.value;
  // Update chapter dropdown to only chapters for selected subject
  let chapterSet = subj && subjectToChapters[subj] ? subjectToChapters[subj] : [];
  setOptions(chapterFilter, chapterSet, "Chapter");
  filterQuestions();
};
// Also, update chapterFilter to filter questions on change:
chapterFilter.onchange = function () {
  filterQuestions();
};
}
  function filterQuestions() {
  let classVal = classFilter.value.trim();
  if (!classVal) {
    renderQuestions([]);
    return;
  }
  let subjectVal = subjectFilter.value.trim();
  let chapterVal = chapterFilter.value.trim();

  filteredQuestions = qbQuestions.filter(q => {
    let matches = true;
    if (classVal && (!q.class || q.class != classVal)) matches = false;
    if (subjectVal && (!q.subject || q.subject != subjectVal)) matches = false;
    if (chapterVal && (!q.chapter || q.chapter != chapterVal)) matches = false;
    return matches;
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

  [classFilter, subjectFilter, chapterFilter, difficultyFilter, marksFilter].forEach(sel => {
    sel.addEventListener("change", filterQuestions);
  });
}
window.onpopstate = function(event) {
  if (event.state && event.state.section) {
    showSection(event.state.section, false);
  } else {
    // If no state, default to login-section
    showSection('login-section', false);
  }
};
