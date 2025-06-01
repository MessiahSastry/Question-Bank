// dashboard.js

// Firebase references (already initialized in index.html login)
const auth = firebase.auth();
const db = firebase.firestore();

// Simple state
let user = null;
let userDisplayName = "";

// DOM references
const welcomeMessage = document.getElementById("welcome-message");
const displayNameSpan = document.getElementById("display-name");
const settingsBtn = document.getElementById("settings-btn");
const settingsPopup = document.getElementById("settings-popup");
const editNameInput = document.getElementById("edit-name");
const saveNameBtn = document.getElementById("save-name-btn");
const logoutBtn = document.getElementById("logout-btn");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const fasaBtn = document.getElementById("fasa-btn");

// Helper: Show/Hide popup
function showSettingsPopup() {
  settingsPopup.style.display = "flex";
  editNameInput.value = userDisplayName || "";
  editNameInput.focus();
}
function hideSettingsPopup() {
  settingsPopup.style.display = "none";
}

// Load user info and personalize dashboard
auth.onAuthStateChanged(async (u) => {
  if (!u) {
    // Not logged in, go back to login
    window.location.replace("index.html");
    return;
  }
  user = u;

  // Try Firestore first, then fallback to Firebase displayName
  const doc = await db.collection("users").doc(user.uid).get();
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
        // TODO: Open FA/SA builder function/page
        alert("FA/SA Builder coming soon!");
      };
    }
  }
});

// Settings button opens popup
settingsBtn.onclick = showSettingsPopup;
closeSettingsBtn.onclick = hideSettingsPopup;

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
    hideSettingsPopup();
    alert("Name updated!");
  } catch (e) {
    alert("Failed to save name. Try again.");
  }
};

// Logout
logoutBtn.onclick = () => {
  auth.signOut().then(() => {
    window.location.replace("index.html");
  });
};

// Optional: Close popup if user clicks outside modal
settingsPopup.addEventListener("click", (e) => {
  if (e.target === settingsPopup) hideSettingsPopup();
});

// Hook up main dashboard buttons (add as needed)
document.getElementById("gen-ai-btn").onclick = function() {
  alert("AI Question Generation coming soon!");
};
document.getElementById("manual-add-btn").onclick = function() {
  alert("Manual Question Entry coming soon!");
};
document.getElementById("qbank-btn").onclick = function() {
  alert("Question Bank View coming soon!");
};
document.getElementById("sliptest-btn").onclick = function() {
  alert("Slip Test Paper Builder coming soon!");
};
document.getElementById("textbooks-btn").onclick = function() {
  alert("AP Textbook Viewer coming soon!");
};
