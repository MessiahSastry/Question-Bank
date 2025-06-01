// index.js

// Firebase Config - use your question bank project config
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
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

const splash = document.getElementById('splash');
const loginRoot = document.getElementById('login-root');

// Utility: Hide splash and show login UI after loading
function hideSplashAndShowLogin() {
  if (splash) splash.classList.add('hidden');
  if (loginRoot) loginRoot.style.display = 'flex';
}

// Renders login UI
function showLoginUI() {
  if (!loginRoot) return;
  loginRoot.innerHTML = `
    <div class="login-box">
      <div class="school-title">St. Patrick’s School</div>
      <div class="subtitle">IIT & NEET FOUNDATION</div>
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
  loginRoot.style.display = 'flex';
}

// Email sign-in
window.emailSignIn = function () {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!email || !password) return alert('Enter email and password!');
  auth.signInWithEmailAndPassword(email, password)
    .then(() => window.location.href = "dashboard.html")
    .catch(err => alert(err.message));
};

// Email registration
window.emailRegister = function () {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!email || !password) return alert('Enter email and password!');
  auth.createUserWithEmailAndPassword(email, password)
    .then(() => {
      alert("Registration successful! You are now signed in.");
      window.location.href = "dashboard.html";
    })
    .catch(err => alert(err.message));
};

// Google sign-in
window.googleSignIn = function () {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(() => window.location.href = "dashboard.html")
    .catch(err => alert(err.message));
};

// Forgot password
window.forgotPassword = function () {
  const email = document.getElementById('email').value.trim();
  if (!email) return alert('Enter your email to reset password.');
  auth.sendPasswordResetEmail(email)
    .then(() => alert("Password reset email sent."))
    .catch(err => alert(err.message));
};

auth.onAuthStateChanged(function (user) {
  setTimeout(() => {
    if (splash) splash.classList.add('hidden');
    if (user) {
      window.location.replace("dashboard.html");
    } else {
      showLoginUI();
    }
  }, 2000); // <- 2000 ms = 2 seconds (change as you like)
});

// Splash fade-out after short timeout (if Firebase is slow to load)
window.onload = function () {
  setTimeout(() => {
    if (splash && !splash.classList.contains('hidden')) {
      hideSplashAndShowLogin();
      showLoginUI();
    }
  }, 3000); // fallback timeout, 3 seconds
};
