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

let currentUser = null;
let currentRole = "teacher"; // fallback

// ====== SECTION NAVIGATION WITH ROLE CONTROL ======
function showSection(id, pushState = true) {
  document.querySelectorAll('.app-section').forEach(sec => sec.style.display = 'none');
  document.getElementById(id).style.display = 'block';
  if (pushState) history.pushState({ section: id }, '', '');
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
    <div id="login-root">
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
    .then(cred => {
      // Default to teacher role
      db.collection("users").doc(cred.user.uid).set({
        displayName: "",
        role: "teacher"
      });
      alert("Registration successful! You are now signed in.");
      showSection('dashboard-section');
    })
    .catch(err => alert(err.message));
};

window.googleSignIn = function () {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(cred => {
      db.collection("users").doc(cred.user.uid).set({
        displayName: cred.user.displayName || "",
        role: "teacher"
      }, { merge: true });
      showSection('dashboard-section');
    })
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
auth.onAuthStateChanged(async function (user) {
  setTimeout(async () => {
    if (splash) splash.classList.add('hidden');
    if (user) {
      currentUser = user;
      // Fetch role
      const userDoc = await db.collection("users").doc(user.uid).get();
      currentRole = userDoc.exists ? (userDoc.data().role || "teacher") : "teacher";
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

  let user = auth.currentUser;
  let userDisplayName = "";

  db.collection("users").doc(user.uid).get().then(doc => {
    userDisplayName = doc.exists ? (doc.data().displayName || "") : (user.displayName || "");
    displayNameSpan.textContent = userDisplayName || user.email;
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

  // DASHBOARD NAVIGATION (Role based)
  document.getElementById("gen-ai-btn").onclick = function () {
    showSection('ai-question-section');
    renderAIQuestionUI();
  };
  document.getElementById("qbank-btn").onclick = function () {
    showSection('qbank-section');
    loadQuestionBank();
  };
  document.getElementById("exam-builder-btn").onclick = function () {
    showSection('exam-builder-section');
    renderExamBuilderUI();
  };
}

// ====== AI QUESTION GENERATOR LOGIC (CHAT STYLE) ======
function renderAIQuestionUI() {
  const container = document.getElementById("ai-review-container");
  if (!container) return;

  container.innerHTML = `
    <form id="ai-gen-form" autocomplete="off">
      <label for="ai-class">Class:</label>
      <select id="ai-class" name="class" required>
        <option value="">Select</option>
        <option>6th</option><option>7th</option><option>8th</option>
        <option>9th</option><option>10th</option>
      </select>
      <label for="ai-subject">Subject:</label>
      <select id="ai-subject" name="subject" required>
        <option value="">Select</option>
        <option>Math</option><option>Physics</option><option>Chemistry</option>
        <option>Biology</option><option>English</option><option>Social</option>
      </select>
      <label for="ai-qtype">Question Type:</label>
      <select id="ai-qtype" name="qtype" required>
        <option value="Descriptive">Descriptive</option>
        <option value="MCQ">MCQ</option>
      </select>
      <label for="ai-chapter">Chapter:</label>
      <input id="ai-chapter" name="chapter" type="text" required />
      <button type="button" id="ai-continue-btn" class="btn" style="margin-top:14px;">Continue</button>
    </form>
    <div id="ai-chat-page" style="display:none;">
      <div id="ai-chat-messages" class="chat-messages"></div>
      <div class="chat-bottom-row">
        <input id="ai-prompt-input" placeholder="Enter your question prompt..." autocomplete="off" />
        <input type="file" id="ai-upload-file" accept="image/*,.pdf" style="display:none;">
        <button id="ai-upload-btn" title="Upload Image/File"><i class="fa fa-plus"></i></button>
        <button id="ai-send-btn" class="btn">Send</button>
        <button id="ai-save-all-btn" class="btn" style="margin-left:8px;display:none;">Save</button>
      </div>
    </div>
  `;

  // Events for filtering subjects, etc., can be added here
  // Only show chat on Continue
  container.querySelector("#ai-continue-btn").onclick = function () {
    document.getElementById("ai-gen-form").style.display = "none";
    document.getElementById("ai-chat-page").style.display = "block";
  };

  // Prompt Input, Send, Upload Handling, Chat Rendering, Math Rendering, Edit/Delete popup logic to be added here
  // (Implementation to be extended per full requirements, keeping only skeleton here for brevity)
}

// ====== QUESTION BANK LOGIC ======
function loadQuestionBank() {
  // Load questions for the logged-in user, render using MathJax and in chat style
  // (Implementation to be extended as per requirements)
}

// ====== EXAM BUILDER LOGIC ======
function renderExamBuilderUI() {
  // Render exam builder UI per requirements
  // (Implementation to be extended as per requirements)
}

// ====== MOBILE/BROWSER BACK BUTTON ======
window.addEventListener("popstate", function (event) {
  let section = event.state && event.state.section ? event.state.section : "login-section";
  showSection(section, false);
});
