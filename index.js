// ====== FIREBASE SETUP ======
const firebaseConfig = {
  apiKey: "AIzaSyAszVhWXUUOYLQ7VimKmPKf1yEu_CI9RCE", // Replace with your actual API key
  authDomain: "stpatricks-questionbank.firebaseapp.com",
  projectId: "stpatricks-questionbank",
  storageBucket: "stpatricks-questionbank.appspot.com",
  messagingSenderId: "917615322861",
  appId: "1:917615322861:web:c6c890aa2184dd395b8ee4"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ====== GLOBAL CONFIGURATION & STATE VARIABLES ======
let currentUserProfile = null;

const aiGeneratorConfig = {
    classes: ["3rd Class", "4th Class", "5th Class", "6th Class", "7th Class", "8th Class", "9th Class", "10th Class"],
    // Define subject mappings for each class
    subjectMappings: {
        "3rd Class": ["Telugu", "Hindi", "English 1", "Math 1", "EVS (Social/Science)"],
        "4th Class": ["Telugu", "Hindi", "English 1", "Math 1", "EVS (Social/Science)"],
        "5th Class": ["Telugu", "Hindi", "English 1", "English 2", "Math 1", "EVS (Social/Science)"],
        "6th Class": ["Telugu", "Hindi", "English 1", "English 2", "Math 1", "Math 2", "General Science (Physics, Chemistry, Biology)", "Social"],
        "7th Class": ["Telugu", "Hindi", "English 1", "English 2", "Math 1", "Math 1 IIT", "Math 2", "Physics", "Chemistry", "Biology", "Social"],
        "8th Class": ["Telugu", "Hindi", "English 1", "English 2", "Math 1", "Math 1 IIT", "Math 2", "Math IIT", "Physics", "Physics IIT & NEET", "Chemistry", "Chemistry IIT & NEET", "Biology", "Biology NEET", "Social"],
        "9th Class": ["Telugu", "Hindi", "English 1", "English 2", "Math 1", "Math 1 IIT", "Math 2", "Math IIT", "Physics", "Physics IIT & NEET", "Chemistry", "Chemistry IIT & NEET", "Biology", "Biology NEET", "Social"],
        "10th Class": ["Telugu", "Hindi", "English 1", "English 2", "Math 1", "Math 1 IIT", "Math 2", "Math IIT", "Physics", "Physics IIT & NEET", "Chemistry", "Chemistry IIT & NEET", "Biology", "Biology NEET", "Social"]
    },
    questionTypes: ["MCQs", "Descriptive"],
    // Updated function to get subjects based on the mapping
    getSubjectsForClass: function(className) {
        return this.subjectMappings[className] || []; // Return mapped subjects or an empty array if class not found
    }
};

// Configuration for Exam Builder dropdowns (example structure, populate as needed)
const examBuilderFormConfig = {
  examNameOptions: ["Slip Test", "Fortnightly Test", "Formative Assessment 1", "Formative Assessment 2", "Summative Assessment 1", "Term 1 Exam", "Grand Test"],
  examTypeOptions: ["MCQs", "Descriptive", "Both"],
  mcqLevelOptions: ["Level 1", "Level 2", "Level 3", "Mixed"], // For overall and per-section
  maxMarksOptions: ["10", "15", "20", "25", "30", "40", "50", "80", "100"],
  difficultyOptions: ["Easy/Level 1", "Medium/Level 2", "Difficult/Level 3", "Mixed By Percentage"],
  sectionQuestionTypeOptions: ["MCQs", "Descriptive"] // For individual sections
};

let currentSessionQuestions = []; // For AI Generator session
let qbQuestionsCache = []; // For Question Bank
let activeQuestionEditControls = null; // For AI Generator edit state
let activeQbEditControls = null; // For QB edit state
let examSectionsData = []; // For Exam Builder sections
// ====== UTILITY & HELPER FUNCTIONS ======
// (Currently, specific utility functions are co-located or simple enough not to be grouped here)
// (If complex shared utilities arise, they can be placed here)
function showToast(message, type = 'info', duration = 3000) {
    const toastId = 'toast-popup-message';
    let toast = document.getElementById(toastId);

    if (!toast) {
        toast = document.createElement('div');
        toast.id = toastId;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = `toast-popup show ${type}`; // 'info', 'success', 'error'

    // Clear existing timer if any
    if (toast.timer) {
        clearTimeout(toast.timer);
    }

    toast.timer = setTimeout(() => {
        toast.classList.remove('show');
        // Optionally remove the toast element from DOM after hiding if you prefer
        // if (toast.parentNode) {
        //     toast.parentNode.removeChild(toast);
        // }
    }, duration);
}
// ====== SECTION NAVIGATION & HISTORY ======
function showSection(id, pushState = true) {
  document.querySelectorAll('.app-section').forEach(sec => sec.style.display = 'none');
  const sectionElement = document.getElementById(id);
  if (sectionElement) { sectionElement.style.display = 'block'; }
  else { console.error(`Section with id '${id}' not found.`); }
  if (pushState) { history.pushState({ section: id }, '', `#${id}`); }
}

window.addEventListener("popstate", function (event) {
  let sectionId = (event.state && event.state.section) ? event.state.section : (auth.currentUser ? "dashboard-section" : "login-section");
  showSection(sectionId, false); 
  if (!auth.currentUser && sectionId !== 'login-section') {
      sectionId = 'login-section'; showSection(sectionId, false);
  }
  // Reload data based on section
  if (sectionId === 'dashboard-section' && auth.currentUser) loadDashboard();
  else if (sectionId === 'qbank-section' && auth.currentUser) loadQuestionBank(); 
  else if (sectionId === 'ai-question-section' && auth.currentUser) loadAiQuestionGeneratorForm(); 
  else if (sectionId === 'exam-builder-section' && auth.currentUser) loadExamBuilderForm();
});

// ====== SPLASH SCREEN LOGIC ======
const splash = document.getElementById('splash');
const loginSection = document.getElementById('login-section'); // Defined here for use in hideSplashAndShowLogin

function hideSplashAndShowLogin() {
  if (splash) splash.classList.add('hidden');
  showLoginUI(); // Defined below
}

// ====== LOGIN UI & AUTHENTICATION FUNCTIONS ======
function showLoginUI() {
  loginSection.innerHTML = `
    <div class="login-box">
      <div class="login-header"><div class="login-title">ST. PATRICK'S SCHOOL</div><div class="login-subtitle">IIT & NEET FOUNDATION</div></div>
      <input type="email" id="email" placeholder="Email" autocomplete="username" />
      <input type="password" id="password" placeholder="Password" autocomplete="current-password" />
      <div class="forgot-row"><button type="button" onclick="forgotPassword()">Forgot Password?</button></div>
      <button class="btn-email" onclick="emailSignIn()">Sign in with Email</button>
      <button class="btn-register" onclick="emailRegister()">Register (New User)</button>
      <button class="btn-google" onclick="googleSignIn()"><i class="fab fa-google"></i> Sign in with Google</button>
    </div>`;
  showSection('login-section', false);
}

window.emailSignIn = () => { 
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!email || !password) return alert('Enter email and password!');
  auth.signInWithEmailAndPassword(email, password).catch(err => alert(err.message));
};

window.emailRegister = async () => { 
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!email || !password) return alert('Enter email and password!');
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    if (user) {
      const userDocRef = db.collection("users").doc(user.uid);
      const defaultDisplayName = user.displayName || email.split('@')[0];
      await userDocRef.set({ displayName: defaultDisplayName, email: user.email, role: 'teacher', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      alert("Registration successful! You are now signed in.");
    }
  } catch (err) { alert(err.message); }
};

window.googleSignIn = () => { 
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(async (result) => {
      const user = result.user;
      if (user) { 
        const userDocRef = db.collection("users").doc(user.uid);
        const doc = await userDocRef.get();
        if (!doc.exists) {
          const defaultDisplayName = user.displayName || user.email.split('@')[0];
          await userDocRef.set({ displayName: defaultDisplayName, email: user.email, role: 'teacher', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
      }
    })
    .catch(err => alert(err.message));
};

window.forgotPassword = () => { 
  const email = document.getElementById('email').value.trim();
  if (!email) return alert('Enter your email to reset password.');
  auth.sendPasswordResetEmail(email).then(() => alert("Password reset email sent.")).catch(err => alert(err.message));
};

// ====== AUTH STATE CHANGE HANDLING ======
auth.onAuthStateChanged(user => { 
  setTimeout(async () => { // Delay to allow splash to be visible briefly and Firebase to settle
    if (splash && !splash.classList.contains('hidden')) { // Ensure splash is hidden after timeout if still visible
        splash.classList.add('hidden');
    }
    if (user) {
      try {
        const userDocRef = db.collection("users").doc(user.uid);
        const doc = await userDocRef.get();
        if (doc.exists) {
          currentUserProfile = { uid: user.uid, email: user.email, ...user.providerData[0], ...doc.data() };
          // Ensure role exists, default to 'teacher' if not (e.g., for very old users or manual entries)
          if (!currentUserProfile.role) {
            await userDocRef.set({ role: 'teacher' }, { merge: true });
            currentUserProfile.role = 'teacher';
          }
        } else { // If user exists in Auth but not Firestore (e.g., migration issue, or first Google sign-in)
          const defaultDisplayName = user.displayName || user.email.split('@')[0];
          currentUserProfile = { uid: user.uid, email: user.email, displayName: defaultDisplayName, role: 'teacher' };
          await userDocRef.set({ displayName: defaultDisplayName, email: user.email, role: 'teacher', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
      } catch (error) {
        console.error("Error fetching/creating user profile:", error);
        // Fallback profile if Firestore interaction fails
        const displayName = user.displayName || user.email.split('@')[0]; 
        currentUserProfile = { uid: user.uid, email: user.email, displayName: displayName, role: 'teacher' };
      }
      // Navigate to dashboard or intended section from URL hash if available
      const currentHash = window.location.hash.substring(1);
      if (currentHash && document.getElementById(currentHash)) {
        showSection(currentHash);
        if(currentHash === 'dashboard-section') loadDashboard();
        // Add other section loads here if needed for direct hash navigation after login
      } else {
        showSection('dashboard-section'); history.replaceState({ section: 'dashboard-section' }, '', '#dashboard-section');
        loadDashboard();
      }
    } else { // No user
      currentUserProfile = null;
      showLoginUI();
      history.replaceState({ section: 'login-section' }, '', '#login-section');
    }
  }, 1000); // 1-second delay
});

// ====== DASHBOARD LOGIC ======
function loadDashboard() { 
  const displayNameSpan = document.getElementById("display-name");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsPopup = document.getElementById("settings-popup");
  const editNameInput = document.getElementById("edit-name");
  const saveNameBtn = document.getElementById("save-name-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const closeSettingsBtn = document.getElementById("close-settings-btn");

  if (!currentUserProfile) { auth.signOut(); return; } // Should not happen if auth guard is correct
  let userDisplayName = currentUserProfile.displayName || (currentUserProfile.email ? currentUserProfile.email.split('@')[0] : "User");
  displayNameSpan.textContent = userDisplayName;

  settingsBtn.onclick = function () {
    editNameInput.value = currentUserProfile.displayName || (currentUserProfile.email ? currentUserProfile.email.split('@')[0] : "");
    settingsPopup.style.display = "flex"; editNameInput.focus();
  };
  closeSettingsBtn.onclick = function () { settingsPopup.style.display = "none"; };
  saveNameBtn.onclick = async () => {
    const newName = editNameInput.value.trim();
    if (!newName) return alert("Please enter your name.");
    try {
      await db.collection("users").doc(currentUserProfile.uid).set({ displayName: newName }, { merge: true });
      // Also update Firebase Auth profile display name if possible and different
      if (auth.currentUser && auth.currentUser.displayName !== newName) { 
        await auth.currentUser.updateProfile({ displayName: newName });
      }
      currentUserProfile.displayName = newName; // Update local profile object
      displayNameSpan.textContent = newName;
      settingsPopup.style.display = "none"; alert("Name updated!");
    } catch (e) {
      console.error("Failed to save name:", e); alert("Failed to save name. Try again.");
    }
  };
  logoutBtn.onclick = () => { auth.signOut().then(() => { currentUserProfile = null; /* Auth listener will handle UI change */ }); };
  // Close popup if clicked outside content
  settingsPopup.addEventListener("click", (e) => { if (e.target === settingsPopup) settingsPopup.style.display = "none"; });

  document.getElementById("gen-ai-btn").onclick = () => { showSection('ai-question-section'); loadAiQuestionGeneratorForm(); };
  document.getElementById("qbank-btn").onclick = () => { showSection('qbank-section'); loadQuestionBank(); };
  document.getElementById("exam-builder-btn").onclick = () => { 
    showSection('exam-builder-section'); 
    loadExamBuilderForm();
  };
}

// ====== AI QUESTION GENERATOR - SETUP FORM ======
function loadAiQuestionGeneratorForm() { 
    const aiReviewContainer = document.getElementById('ai-review-container');
    if (!aiReviewContainer) { console.error("AI Review Container not found!"); return; }

    let classDropdownHTML = aiGeneratorConfig.classes.map(c => `<div data-value="${c}">${c}</div>`).join('');
    let initialSubjects = aiGeneratorConfig.getSubjectsForClass(aiGeneratorConfig.classes[0]); // TODO: Make this dynamic based on actual selected class later
    let subjectDropdownHTML = initialSubjects.map(s => `<div data-value="${s}">${s}</div>`).join('');
    let qTypeDropdownHTML = aiGeneratorConfig.questionTypes.map(qt => `<div data-value="${qt}">${qt}</div>`).join('');

    aiReviewContainer.innerHTML = `
        <h2>AI Question Generator - Setup</h2>
        <form id="ai-setup-form">
            <label for="class-ai">Class:</label>
            <div id="class-dropdown-ai" class="custom-dropdown">
                <input type="hidden" name="class" id="class-value-ai" value="${aiGeneratorConfig.classes[0]}">
                <div class="selected-option">${aiGeneratorConfig.classes[0]}</div>
                <div class="dropdown-options">${classDropdownHTML}</div>
            </div>
            <label for="subject-ai">Subject:</label>
            <div id="subject-dropdown-ai" class="custom-dropdown">
                <input type="hidden" name="subject" id="subject-value-ai" value="${initialSubjects.length > 0 ? initialSubjects[0] : ''}">
                <div class="selected-option">${initialSubjects.length > 0 ? initialSubjects[0] : 'Select Subject'}</div>
                <div class="dropdown-options">${subjectDropdownHTML}</div>
            </div>
            <label for="qtype-ai">Question Type:</label>
            <div id="qtype-dropdown-ai" class="custom-dropdown">
                <input type="hidden" name="questionType" id="qtype-value-ai" value="${aiGeneratorConfig.questionTypes[0]}">
                <div class="selected-option">${aiGeneratorConfig.questionTypes[0]}</div>
                <div class="dropdown-options">${qTypeDropdownHTML}</div>
            </div>
            <label for="chapter-input-ai">Chapter:</label>
            <input type="text" id="chapter-input-ai" name="chapter" placeholder="E.g., Kinematics" required>
            <button type="submit" class="btn">Continue</button>
        </form>`;

    // Setup custom dropdowns and their change handlers
    setupCustomDropdown('class-dropdown-ai', 'class-value-ai', (selectedClass) => {
        const subjectOptionsContainer = document.querySelector('#subject-dropdown-ai .dropdown-options');
        const subjectSelectedOption = document.querySelector('#subject-dropdown-ai .selected-option');
        const subjectHiddenInput = document.getElementById('subject-value-ai');
        if (!subjectOptionsContainer || !subjectSelectedOption || !subjectHiddenInput) return;

        // TODO: Update aiGeneratorConfig.getSubjectsForClass to actually filter by class
        const newSubjects = aiGeneratorConfig.getSubjectsForClass(selectedClass);
        subjectOptionsContainer.innerHTML = newSubjects.map(s => `<div data-value="${s}">${s}</div>`).join('');
        if (newSubjects.length > 0) {
            subjectSelectedOption.textContent = newSubjects[0];
            subjectHiddenInput.value = newSubjects[0];
        } else {
            subjectSelectedOption.textContent = 'No Subjects Available';
            subjectHiddenInput.value = '';
        }
        // Re-attach listeners to new subject options
        optionsContainerListener(subjectOptionsContainer, subjectSelectedOption, subjectHiddenInput, document.getElementById('subject-dropdown-ai'), null);
    });
    setupCustomDropdown('subject-dropdown-ai', 'subject-value-ai');
    setupCustomDropdown('qtype-dropdown-ai', 'qtype-value-ai');

    document.getElementById("ai-setup-form").onsubmit = function (e) {
        e.preventDefault();
        const sessionParams = {
            class: document.getElementById('class-value-ai').value,
            subject: document.getElementById('subject-value-ai').value,
            questionType: document.getElementById('qtype-value-ai').value,
            chapter: document.getElementById('chapter-input-ai').value.trim(),
        };
        if (!sessionParams.chapter) { alert("Please enter a chapter."); return; }
        if (!sessionParams.subject) { alert("Please select a subject."); return; } 
        loadAiChatInterface(sessionParams);
    };
}

// ====== AI QUESTION GENERATOR - CHAT INTERFACE & CORE LOGIC ======
function loadAiChatInterface(sessionParams) {
    const aiReviewContainer = document.getElementById('ai-review-container');
    if (!aiReviewContainer) return;

    currentSessionQuestions = []; // Reset for new session

    // Ensure file input exists for image uploads
    let fileInput = document.getElementById('image-upload-input-ai');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'image-upload-input-ai';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput); // Append globally or to a specific container
    }

    aiReviewContainer.innerHTML = `
        <div class="ai-chat-header">
            <h3>Generating: ${sessionParams.questionType}</h3>
            <p><strong>Class:</strong> ${sessionParams.class} | <strong>Subject:</strong> ${sessionParams.subject} | <strong>Chapter:</strong> ${sessionParams.chapter}</p>
            <button id="ai-save-all-chat-btn" class="btn-small" style="position: absolute; top: 10px; right: 10px; z-index:10;">Save All</button>
            <button id="ai-back-to-setup-btn" class="btn-small" style="float:left; margin-right:10px;">Change Setup</button>
        </div>
        <div id="chat-messages-area" class="chat-messages-area">
            <div class="message system-message">Hello! Enter your prompt below or upload an image to extract text.</div>
        </div>
        <div id="chat-input-bar" class="chat-input-bar">
            <button id="chat-upload-btn" title="Upload Image to Extract Text"><i class="fas fa-paperclip"></i></button>
            <textarea id="chat-prompt-input" placeholder="Enter your prompt..."></textarea>
            <button id="chat-send-btn" title="Send Prompt"><i class="fas fa-paper-plane"></i></button>
        </div>`;

    document.getElementById('ai-back-to-setup-btn').onclick = loadAiQuestionGeneratorForm;
    const saveAllBtnChat = document.getElementById('ai-save-all-chat-btn');
    const chatPromptInput = document.getElementById('chat-prompt-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatUploadBtn = document.getElementById('chat-upload-btn');
    const chatMessagesArea = document.getElementById('chat-messages-area');
    const imageUploadInputAi = document.getElementById('image-upload-input-ai'); // Get reference to the one we ensured exists

    saveAllBtnChat.onclick = async () => {
        if (!currentUserProfile || !auth.currentUser) { alert("Please login to save questions."); return; }
        if (currentSessionQuestions.length === 0) { alert("No questions generated or parsed in this session to save."); return; }

        saveAllBtnChat.disabled = true; saveAllBtnChat.textContent = "Saving...";
        let savedCount = 0; let skippedCount = 0; const userId = currentUserProfile.uid;

        for (const qData of currentSessionQuestions) {
            // Ensure essential data for saving is present
            if (!qData.parsedBody || !qData.class || !qData.subject || !qData.chapter) {
                skippedCount++;
                console.warn("Skipping question due to missing essential data:", qData);
                continue;
            }
            // Duplicate check based on question body, class, subject, chapter, and creator
            const duplicateQuery = db.collection("questions")
                                    .where("body", "==", qData.parsedBody)
                                    .where("class", "==", qData.class)
                                    .where("subject", "==", qData.subject)
                                    .where("chapter", "==", qData.chapter)
                                    .where("createdBy", "==", userId);
            const snapshot = await duplicateQuery.get();
            if (!snapshot.empty) {
                skippedCount++;
                console.log("Duplicate question skipped:", qData.parsedBody.substring(0,50) + "...");
                continue;
            }

            try {
                await db.collection("questions").add({
                    text: qData.fullText, // Full original text from AI/OCR
                    body: qData.parsedBody, // Parsed question body
                    metaLine: qData.parsedMeta, // Parsed meta line (Q#: Diff/Level, Marks)
                    difficulty: qData.difficulty,
                    level: qData.level,
                    marks: qData.marks,
                    class: qData.class, // From sessionParams
                    subject: qData.subject, // From sessionParams
                    chapter: qData.chapter, // From sessionParams
                    createdBy: userId,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                savedCount++;
            } catch (error) {
                console.error("Error saving question to Firestore:", error, qData);
                // Optionally, provide feedback for individual save failures if needed
            }
        }
        alert(`${savedCount} question(s) saved successfully. ${skippedCount} question(s) skipped (missing data or duplicate).`); // TODO: Change to toast
        saveAllBtnChat.disabled = false; saveAllBtnChat.textContent = "Save All";
    };

    chatUploadBtn.onclick = () => { imageUploadInputAi.click(); };
    imageUploadInputAi.onchange = async function(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            alert("Please upload an image file (PNG, JPG, etc.)."); // TODO: Change to toast
            event.target.value = null; // Reset file input
            return;
        }

        appendChatMessage(`Processing image: ${file.name}...`, 'system', chatMessagesArea);
        chatPromptInput.disabled = true; chatSendBtn.disabled = true; chatUploadBtn.disabled = true;

        const formData = new FormData();
        formData.append('imageFile', file);

        try {
            const response = await fetch("/api/extract-from-image", { method: 'POST', body: formData });
            const result = await response.json();

            if (!response.ok) { throw new Error(result.error || `HTTP error ${response.status}`); }

            if (result.error) {
                appendChatMessage(`Error extracting from image: ${result.error}`, 'error', chatMessagesArea);
            } else if (result.result) {
                appendChatMessage(`Text extracted from ${file.name}:`, 'system', chatMessagesArea);
                parseAndDisplayAiQuestions(result.result, chatMessagesArea, sessionParams, currentSessionQuestions);
            } else {
                appendChatMessage("No text extracted or an unexpected issue occurred with image processing.", 'error', chatMessagesArea);
            }
        } catch (err) {
            appendChatMessage(`Image processing request failed: ${err.message}`, 'error', chatMessagesArea);
        } finally {
            chatPromptInput.disabled = false; chatSendBtn.disabled = false; chatUploadBtn.disabled = false;
            event.target.value = null; // Reset file input
        }
    };

    chatSendBtn.onclick = async function() {
        const userPrompt = chatPromptInput.value.trim();
        if (!userPrompt) return;

        appendChatMessage(userPrompt, 'user', chatMessagesArea);
        chatPromptInput.value = ''; // Clear input after sending
        chatPromptInput.disabled = true; chatSendBtn.disabled = true; chatUploadBtn.disabled = true;

        // Construct the detailed prompt for the AI
        const fullPromptForAI = `Based on the following setup:
Class: ${sessionParams.class}
Subject: ${sessionParams.subject}
Chapter: ${sessionParams.chapter}
Question Type: ${sessionParams.questionType}

User request: "${userPrompt}"

Generate the questions.
Format each question EXACTLY like this:
Q <number>: <DifficultyName>/Level <LevelNumber>, <MarksValue> Marks
The question text itself starts on the very next line.

Example 1:
Q 1: Difficult/Level 3, 2 Marks
What is the primary function of the mitochondria?

Example 2 (if level is not applicable or not specified by AI):
Q 2: Easy, 4 Marks
Define 'photosynthesis'.

Example 3 (if level is applicable):
Q 3: Medium/Level 2, 5 Marks
Explain the concept of inertia with an example.

Important Formatting Rules:
- The first line for each question MUST strictly follow the format: "Q <number>: <DifficultyName><Optional: /Level X>, <MarksValue> Marks".
- DifficultyName can be Easy, Medium, Difficult, or similar descriptive terms.
- "/Level X" (where X is a number) is optional; include it if the AI deems it relevant for the question's context, otherwise omit it.
- MarksValue MUST be a number followed by the word "Marks".
- The question text begins on the line immediately following this meta-data line.
- Do NOT use Markdown (like ###) or any other special formatting in the meta-data line or the question body itself, just plain text as shown in the examples.
- Provide ONLY the questions as per the format. DO NOT include answers or solutions.`;

        appendChatMessage("Generating questions...", 'system blink', chatMessagesArea); // Blinking class defined in CSS

        try {
            const response = await fetch("https://question-bank-lqsu.onrender.com/generate", { // Ensure this URL is correct or use relative /generate if same origin
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: fullPromptForAI })
            });
            const result = await response.json();

            // Remove blinking message
            const blinkMsg = chatMessagesArea.querySelector('.blinking-text.system-message');
            if (blinkMsg) blinkMsg.remove();

            if (result.error) {
                appendChatMessage(`AI Error: ${result.error}`, 'error', chatMessagesArea);
            } else if (result.result) {
                parseAndDisplayAiQuestions(result.result, chatMessagesArea, sessionParams, currentSessionQuestions);
            } else {
                appendChatMessage("Received an empty or invalid response from the AI.", 'error', chatMessagesArea);
            }
        } catch (err) { 
            const blinkMsg = chatMessagesArea.querySelector('.blinking-text.system-message'); // Ensure removal on error too
            if (blinkMsg) blinkMsg.remove();
            appendChatMessage(`Request to AI failed: ${err.message || 'Check network connection or server status.'}`, 'error', chatMessagesArea);
        } finally { 
            chatPromptInput.disabled = false; chatSendBtn.disabled = false; chatUploadBtn.disabled = false;
            chatPromptInput.focus();
        }
    };

    // Allow Enter to send, Shift+Enter for newline in textarea
    chatPromptInput.addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatSendBtn.click();
        }
    });
}

// ====== AI QUESTION GENERATOR - QUESTION RENDERING & PARSING ======
function appendChatMessage(message, type, messagesArea) { 
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type + '-message');

    if (type === 'user' || type === 'ai-raw') { // Use <pre> for user input and raw AI to preserve formatting
        const pre = document.createElement('pre');
        pre.textContent = message;
        messageDiv.appendChild(pre);
    } else {
        // For system, error, and structured AI messages (handled by parseAndDisplay), direct text or HTML.
        // If HTML is intended (e.g. from a trusted source or carefully constructed), use innerHTML.
        // For simple text, textContent is safer. Here, assuming simple text for system/error.
        messageDiv.textContent = message;
    }

    // If it's a raw AI message that didn't parse into questions, it still uses ai-message class for styling.
    if (type === 'ai-raw') {
        messageDiv.classList.remove('ai-raw-message'); // Remove if it was temp
        messageDiv.classList.add('ai-message'); // Ensure it looks like an AI bubble
    }

    messagesArea.appendChild(messageDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight; // Auto-scroll to latest message

    if (type.includes('blink')) { // Check if 'blink' is part of the type string
        messageDiv.classList.add('blinking-text');
    }
}

function renderAiQuestionToChat(questionData, index) {
    const questionContainer = document.createElement('div');
    questionContainer.className = 'message ai-message ai-question-item'; // All questions are AI messages
    questionContainer.dataset.questionId = questionData.id; // Unique ID for this session question
    questionContainer.dataset.sessionQuestionIndex = index; // Index in currentSessionQuestions array

    const metaDiv = document.createElement('div'); 
    metaDiv.className = 'question-meta-ai'; // Styled Red
    metaDiv.textContent = questionData.parsedMeta || "Meta: Not available";
    
    const bodyDiv = document.createElement('div'); 
    bodyDiv.className = 'question-text-ai'; // Styled Blue
    bodyDiv.textContent = questionData.parsedBody || "Body: Not available";

    questionContainer.appendChild(metaDiv); 
    questionContainer.appendChild(bodyDiv);
    return questionContainer;
}

function displayAllSessionQuestions(messagesArea, questionsArray) {
    // Remove only existing AI question items, not other system/user messages
    const existingQuestionItems = messagesArea.querySelectorAll('.ai-question-item');
    existingQuestionItems.forEach(item => item.remove());
    
    questionsArray.forEach((qData, index) => {
        const questionElement = renderAiQuestionToChat(qData, index);
        messagesArea.appendChild(questionElement);
    });

    if (questionsArray.length > 0 && window.MathJax) {
        MathJax.typesetPromise([messagesArea]).catch(err => console.error("MathJax typesetting error on refresh:", err));
    }
    // Scroll to bottom if new questions were added, but be mindful if user is editing.
    // This function is called after edits too, so aggressive scrolling might be disruptive.
    // Consider scrolling only if it's a fresh batch of questions.
    // messagesArea.scrollTop = messagesArea.scrollHeight;
}

function parseAndDisplayAiQuestions(aiResponseText, messagesArea, sessionParams, sessionQuestionsArrayRef) {
    // Regex to split questions, looking for "Q <number>:" pattern at the start of a line.
    // It uses a positive lookahead `(?=Q\s*\d+:)` to split without consuming the delimiter.
    const questionsTextBlocks = aiResponseText.split(/\n(?=Q\s*\d+:)/g).map(q => q.trim()).filter(q => q);
    let newQuestionsParsedThisCall = false;

    if (questionsTextBlocks.length === 0 && aiResponseText.trim() !== "") {
        // If no blocks match "Q <num>:", display the raw response as a single AI message.
        appendChatMessage(aiResponseText, 'ai-raw', messagesArea);
    }

    questionsTextBlocks.forEach((qText) => { 
        const questionId = `q-session-${Date.now()}-${sessionQuestionsArrayRef.length}`; 
        // Regex to parse the meta-line: "Q <num>: <Diff><Optional: /Level X>, <Marks> Marks"
        // It captures: 1=FullMeta, 2=QNum, 3=Difficulty, 4=LevelNum (optional), 5=MarksNum, 6=Body
        const questionRegex = /^(Q\s*(\d+):\s*([^,/]+?)(?:\/Level\s*(\d+))?,\s*(\d+)\s*Marks)\s*([\s\S]*)/im;
        const match = qText.match(questionRegex);

        const questionData = { 
            id: questionId,
            fullText: qText, // Store the full original block for this question
            class: sessionParams.class,
            subject: sessionParams.subject,
            chapter: sessionParams.chapter,
            parsedMeta: null,
            parsedBody: null,
            difficulty: null,
            level: null,
            marks: null,
            questionNumberInAIResponse: null,
            originalParsedMeta: null, // For edit cancellation
            originalParsedBody: null  // For edit cancellation
        };

        if (match) { 
            questionData.parsedMeta = match[1].trim(); // The whole "Q 1: Diff/Lvl, Marks" string
            questionData.questionNumberInAIResponse = match[2]?.trim(); // Just the number "1"
            questionData.difficulty = match[3]?.trim(); // "Difficult" or "Easy"
            questionData.level = match[4] ? parseInt(match[4].trim(), 10) : null; // "3" or null
            questionData.marks = match[5] ? parseInt(match[5].trim(), 10) : null; // "2" or null
            questionData.parsedBody = match[6]?.trim() || ""; // The actual question text
        } else {
            // If regex doesn't match, treat the whole block as body, no meta.
            // This might happen if AI formatting is off.
            questionData.parsedBody = qText;
            questionData.parsedMeta = ""; // Ensure it's not null for display
            console.warn("AI Question Meta parsing failed for block:", qText.substring(0,100)+"...");
        }
        // Store originals for potential edit cancellation
        questionData.originalParsedMeta = questionData.parsedMeta;
        questionData.originalParsedBody = questionData.parsedBody;

        sessionQuestionsArrayRef.push(questionData);
        newQuestionsParsedThisCall = true;
    });

    if (newQuestionsParsedThisCall) {
        // Re-render all questions in the session to include the new ones
        displayAllSessionQuestions(messagesArea, sessionQuestionsArrayRef);
    }
    if (questionsTextBlocks.length > 0) { // Only scroll if we actually parsed and displayed new question blocks
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }
}

// ====== AI QUESTION GENERATOR - IN-SESSION EDIT/DELETE LOGIC ======
// `activeQuestionEditControls` is a global variable to track the currently active edit UI

// Click listener for messages area to handle edit/delete popups
// This should be attached when loadAiChatInterface is called
// Example: chatMessagesArea.addEventListener('click', (event) => { ... }); // Already in loadAiChatInterface

function showEditDeletePopup(targetElement, questionIndex, messagesArea, sessionParams, questionsArrayRef) {
    const existingPopup = document.getElementById('ai-question-editor-popup');
    if (existingPopup) existingPopup.remove(); // Remove any old popups

    const popup = document.createElement('div');
    popup.id = 'ai-question-editor-popup';
    popup.className = 'ai-question-popup'; // Use CSS styles for this class

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.className = 'popup-edit-btn';
    editButton.onclick = (e) => {
        e.stopPropagation(); // Prevent chatMessagesArea click listener if it's still bubbling
        enableQuestionEditMode(targetElement, questionIndex, messagesArea, sessionParams, questionsArrayRef);
        popup.remove(); 
    };

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.className = 'popup-delete-btn';
    deleteButton.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete this question from the current session?\n"${questionsArrayRef[questionIndex].parsedBody.substring(0, 70)}..."`)) {
            questionsArrayRef.splice(questionIndex, 1); // Remove from session array
            displayAllSessionQuestions(messagesArea, questionsArrayRef); // Re-render session questions
        }
        popup.remove();
    };

    popup.appendChild(editButton);
    popup.appendChild(deleteButton);
    document.body.appendChild(popup); // Append to body for global positioning

    // Positioning logic for the popup
    const rect = targetElement.getBoundingClientRect();
    popup.style.position = 'absolute';
    
    let popupTop = window.scrollY + rect.top + (rect.height / 2) - (popup.offsetHeight / 2);
    let popupLeft = window.scrollX + rect.left + rect.width + 5; // Default to right

    if (popupLeft + popup.offsetWidth > window.innerWidth) { // If off-screen right
        popupLeft = window.scrollX + rect.left - popup.offsetWidth - 5; // Try left
    }
    if (popupLeft < 0) { // If still off-screen left (e.g. narrow view or wide popup)
        popupLeft = window.scrollX + rect.left + (rect.width / 2) - (popup.offsetWidth / 2); // Center below/above target
        popupTop = window.scrollY + rect.bottom + 5; // Position below
        if (popupTop + popup.offsetHeight > window.innerHeight + window.scrollY) { // If off-screen bottom
            popupTop = window.scrollY + rect.top - popup.offsetHeight - 5; // Position above
        }
    }
    // Ensure popup top is within viewport vertical scroll bounds
    if (popupTop < window.scrollY) popupTop = window.scrollY;
    if (popupTop + popup.offsetHeight > window.innerHeight + window.scrollY) {
        popupTop = window.innerHeight + window.scrollY - popup.offsetHeight;
    }

    popup.style.top = `${popupTop}px`;
    popup.style.left = `${popupLeft}px`;
}

function enableQuestionEditMode(questionElement, questionIndex, messagesArea, sessionParams, questionsArrayRef) {
    // If another edit is active, finalize or cancel it first
    if (activeQuestionEditControls) {
        const prevQuestionEl = activeQuestionEditControls.parentElement;
        if (prevQuestionEl && prevQuestionEl.dataset.sessionQuestionIndex !== undefined) {
            const prevIndex = parseInt(prevQuestionEl.dataset.sessionQuestionIndex, 10);
            // Pass 'false' to not save changes for the previously active edit
            disableQuestionEditMode(prevQuestionEl, prevIndex, messagesArea, sessionParams, questionsArrayRef, false);
        }
    }
    
    questionElement.classList.add('editing-question'); // CSS class for visual cues
    const questionData = questionsArrayRef[questionIndex];
    const metaDiv = questionElement.querySelector('.question-meta-ai');
    const bodyDiv = questionElement.querySelector('.question-text-ai');

    if (!metaDiv || !bodyDiv) {
        console.error("Could not find meta or body div for editing.");
        questionElement.classList.remove('editing-question');
        return;
    }

    // Store original values at the start of this specific edit session, if not already stored
    // (originalParsedMeta/Body are set at initial parsing)
    // No, we use the values already stored in questionData.originalParsedMeta/Body

    metaDiv.contentEditable = true;
    bodyDiv.contentEditable = true;
    metaDiv.style.border = '1px dashed #007bff'; // Visual cue for editable
    bodyDiv.style.border = '1px dashed #007bff';
    metaDiv.focus(); // Focus on the first editable field

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'q-edit-controls'; // CSS for styling save/cancel buttons
    
    const saveEditBtn = document.createElement('button');
    saveEditBtn.textContent = 'Save Edit';
    saveEditBtn.className = 'btn-small btn-save-edit';
    saveEditBtn.onclick = (e) => {
        e.stopPropagation();
        disableQuestionEditMode(questionElement, questionIndex, messagesArea, sessionParams, questionsArrayRef, true); // true = save changes
    };

    const cancelEditBtn = document.createElement('button');
    cancelEditBtn.textContent = 'Cancel';
    cancelEditBtn.className = 'btn-small btn-cancel-edit';
    cancelEditBtn.onclick = (e) => {
        e.stopPropagation();
        disableQuestionEditMode(questionElement, questionIndex, messagesArea, sessionParams, questionsArrayRef, false); // false = cancel, revert
    };

    controlsDiv.appendChild(saveEditBtn);
    controlsDiv.appendChild(cancelEditBtn);
    questionElement.appendChild(controlsDiv); // Add controls to the question item
    activeQuestionEditControls = controlsDiv; // Store reference to current controls
}

function disableQuestionEditMode(questionElement, questionIndex, messagesArea, sessionParams, questionsArrayRef, saveChanges) {
    if (!questionElement || !questionElement.classList.contains('editing-question')) return;

    const questionData = questionsArrayRef[questionIndex];
    const metaDiv = questionElement.querySelector('.question-meta-ai');
    const bodyDiv = questionElement.querySelector('.question-text-ai');
    
    if (!metaDiv || !bodyDiv) return; // Should not happen if enable was successful

    if (saveChanges) {
        const newMetaText = metaDiv.innerText.trim(); // Get edited text
        const newBodyText = bodyDiv.innerText.trim();

        questionData.parsedBody = newBodyText;
        
        // Re-parse the meta line to update difficulty, level, marks from the edited text
        const metaRegex = /^(Q\s*(\d+):\s*([^,/]+?)(?:\/Level\s*(\d+))?,\s*(\d+)\s*Marks)/im;
        const metaMatch = newMetaText.match(metaRegex);
        if (metaMatch) {
            questionData.parsedMeta = metaMatch[1].trim();
            questionData.questionNumberInAIResponse = metaMatch[2]?.trim(); // Keep Q number if possible
            questionData.difficulty = metaMatch[3]?.trim();
            questionData.level = metaMatch[4] ? parseInt(metaMatch[4].trim(), 10) : null;
            questionData.marks = metaMatch[5] ? parseInt(metaMatch[5].trim(), 10) : null;
        } else {
            // If meta line format is broken by edit, store the raw text and clear structured fields
            questionData.parsedMeta = newMetaText;
            questionData.difficulty = null; questionData.level = null; questionData.marks = null;
            console.warn("Meta line may be malformed after edit, storing as typed:", newMetaText);
        }
        // Update fullText based on potentially modified meta and body
        questionData.fullText = (questionData.parsedMeta || "") + "\n" + (questionData.parsedBody || "");

        // Update the 'original' values to this saved state, so a subsequent 'cancel'
        // doesn't revert to a state before this save.
        questionData.originalParsedMeta = questionData.parsedMeta;
        questionData.originalParsedBody = questionData.parsedBody;

    } else { // Cancelled, revert to original stored in questionData for this edit session
        metaDiv.textContent = questionData.originalParsedMeta; // Revert from stored original
        bodyDiv.textContent = questionData.originalParsedBody;
    }

    metaDiv.contentEditable = false;
    bodyDiv.contentEditable = false;
    metaDiv.style.border = 'none'; // Remove edit visual cues
    bodyDiv.style.border = 'none';
    questionElement.classList.remove('editing-question');
    
    const controlsDiv = questionElement.querySelector('.q-edit-controls');
    if (controlsDiv) controlsDiv.remove();
    activeQuestionEditControls = null; // No active edit controls now

    // Re-render all questions to reflect changes and re-apply MathJax if necessary
    displayAllSessionQuestions(messagesArea, questionsArrayRef); 
}

// Attach click listener to chatMessagesArea for edit/delete popup activation
// This is done inside loadAiChatInterface after chatMessagesArea is created.
// Example:
// const chatMessagesArea = document.getElementById('chat-messages-area');
// chatMessagesArea.addEventListener('click', function(event) { /* ... logic from original code ... */ });
// This logic was present in the original index.js and should be within loadAiChatInterface

// ====== QUESTION BANK - LOADING & INITIAL SETUP ======
// `qbQuestionsCache` and `activeQbEditControls` are global state variables

async function loadQuestionBank() {
    const qbOutputDiv = document.getElementById("qb-output");
    if (!qbOutputDiv) { console.error("Question Bank output div not found"); return; }
    
    qbOutputDiv.innerHTML = "Loading questions...";

    if (!currentUserProfile || !auth.currentUser) {
        console.warn("User not logged in. Redirecting to login for Question Bank.");
        showSection('login-section'); 
        return;
    }

    try {
        const query = db.collection("questions")
                        .where("createdBy", "==", currentUserProfile.uid)
                        .orderBy("timestamp", "desc"); // Show newest first

        const snapshot = await query.get();
        qbQuestionsCache = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, // Firestore document ID
                ...data,
                // Store original values for potential edit cancellation in QB
                // Use metaLine if present, otherwise construct from parts
                originalParsedMetaToEdit: data.metaLine || (data.difficulty && data.marks ? `Q: ${data.difficulty}${data.level ? '/Level '+data.level : ''}, ${data.marks} Marks` : "Meta Details"),
                originalParsedBodyToEdit: data.body || data.text || "" // 'body' is preferred, fallback to 'text'
            };
        });
        
        setupQuestionBankFilters(); // Populate filter dropdowns
        filterAndDisplayQbQuestions(); // Initial display of questions

        // Ensure event listener for item clicks is only added once or managed properly
        qbOutputDiv.removeEventListener('click', handleQbItemClick); // Remove old if any
        qbOutputDiv.addEventListener('click', handleQbItemClick);

    } catch (error) {
        console.error("Error loading question bank:", error);
        qbOutputDiv.innerHTML = "<p>Error loading questions. Please try again.</p>";
    }
}

// ====== QUESTION BANK - FILTERING & DISPLAY ======
function setupQuestionBankFilters() {
    // Populate Class dropdown (already static in HTML via JS, but could be dynamic if classes change)
    const classFilterDropdown = document.getElementById('class-filter-qb-dropdown');
    if (classFilterDropdown) {
        const classOptionsContainer = classFilterDropdown.querySelector('.dropdown-options');
        if (classOptionsContainer) {
            classOptionsContainer.innerHTML = `<div data-value="">All Classes</div>` +
                aiGeneratorConfig.classes.map(c => `<div data-value="${c}">${c}</div>`).join('');
            setupCustomDropdown('class-filter-qb-dropdown', 'class-filter-qb', filterAndDisplayQbQuestions);
        }
    }

    // Populate Subject dropdown
    const subjectFilterDropdown = document.getElementById('subject-filter-qb-dropdown');
    if (subjectFilterDropdown) {
        const subjectOptionsContainer = subjectFilterDropdown.querySelector('.dropdown-options');
        if (subjectOptionsContainer) {
            subjectOptionsContainer.innerHTML = `<div data-value="">All Subjects</div>` +
                aiGeneratorConfig.subjectsBase.map(s => `<div data-value="${s}">${s}</div>`).join('');
            setupCustomDropdown('subject-filter-qb-dropdown', 'subject-filter-qb', filterAndDisplayQbQuestions);
        }
    }

    // Populate Chapter dropdown (Initially "All Chapters", dynamically updated if needed)
    // For true dynamic update based on selected class/subject from actual questions:
    // 1. Get unique chapters from qbQuestionsCache for current class/subject filters.
    // 2. Re-populate the chapter dropdown options.
    // This part is simplified here; a more robust solution would query distinct chapters.
    const chapterFilterDropdown = document.getElementById('chapter-filter-qb-dropdown');
    if (chapterFilterDropdown) {
        const chapterOptionsContainer = chapterFilterDropdown.querySelector('.dropdown-options');
        if (chapterOptionsContainer) {
            // Placeholder: Ideally, populate with distinct chapters from current filter scope
            chapterOptionsContainer.innerHTML = `<div data-value="">All Chapters</div>`;
            // Add logic here to fetch and populate actual distinct chapters from qbQuestionsCache
            // Example: let distinctChapters = [...new Set(qbQuestionsCache.map(q => q.chapter))];
            // distinctChapters.forEach(ch => chapterOptionsContainer.innerHTML += `<div data-value="${ch}">${ch}</div>`);
        }
        setupCustomDropdown('chapter-filter-qb-dropdown', 'chapter-filter-qb', filterAndDisplayQbQuestions);
    }


    // Marks filter is a standard multi-select, attach change listener
    const marksFilter = document.getElementById("marks-filter-qb");
    if (marksFilter) {
        marksFilter.onchange = filterAndDisplayQbQuestions;
    }
}

// populateCustomDropdownOptions is part of setupCustomDropdown or specific setup functions like setupQuestionBankFilters
// function populateCustomDropdownOptions(dropdownId, optionsArray, defaultOptionText) { /* ... as needed ... */ }


function filterAndDisplayQbQuestions() { 
    const classVal = document.getElementById('class-filter-qb').value;
    const subjectVal = document.getElementById('subject-filter-qb').value;
    const chapterVal = document.getElementById('chapter-filter-qb').value;
    const marksSelect = document.getElementById("marks-filter-qb");
    const selectedMarks = Array.from(marksSelect.selectedOptions).map(opt => opt.value).filter(Boolean);
    const qbOutputDiv = document.getElementById("qb-output");

    const filtered = qbQuestionsCache.filter(q => {
        if (classVal && q.class !== classVal) return false;
        if (subjectVal && q.subject !== subjectVal) return false;
        if (chapterVal && q.chapter !== chapterVal) return false; // Assumes exact match for chapter
        if (selectedMarks.length > 0) {
            // Ensure q.marks is treated as a string for comparison if selectedMarks values are strings
            const qMarksStr = q.marks ? q.marks.toString() : "";
            if (!selectedMarks.includes(qMarksStr)) {
                // Fallback: check metaLine if structured marks field doesn't match
                // This is a basic fallback, could be improved with regex if metaLine is consistent
                const metaLine = q.metaLine || "";
                const marksInMeta = selectedMarks.some(sm => metaLine.includes(`, ${sm} Mark`)); // e.g. ", 2 Marks"
                if (!marksInMeta) return false;
            }
        }
        return true;
    });
    renderQbQuestions(filtered, qbOutputDiv); 
}

function renderQbQuestions(listToRender, outputDiv) { 
    outputDiv.innerHTML = ""; // Clear previous results
    if (listToRender.length === 0) {
        outputDiv.innerHTML = "<p>No questions found matching your criteria.</p>";
        return;
    }

    listToRender.forEach((qData) => { 
        const card = document.createElement("div");
        card.className = "question-card qb-item"; // question-card for base style, qb-item for specific QB logic
        card.dataset.questionDbId = qData.id; // Firestore document ID
        const cacheIndex = qbQuestionsCache.findIndex(q => q.id === qData.id); // For direct access if needed
        card.dataset.qbQuestionCacheIndex = cacheIndex;

        const qTextContainer = document.createElement("div");
        qTextContainer.className = "qb-item-text-container"; 

        // Use metaLine if present, otherwise try to construct from structured fields
        const metaText = qData.metaLine ||
                         (qData.difficulty && qData.marks ?
                            `Q: ${qData.difficulty}${qData.level ? '/Level '+qData.level : ''}, ${qData.marks} Marks` :
                            "Details not fully specified");
        const bodyText = qData.body || qData.text || "Question text not available.";

        const metaDiv = document.createElement('div');
        metaDiv.className = 'question-meta-ai'; // Styled Red (shared with AI gen)
        metaDiv.textContent = metaText;

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'question-text-ai'; // Styled Blue (shared with AI gen)
        bodyDiv.textContent = bodyText; 
        
        qTextContainer.appendChild(metaDiv);
        qTextContainer.appendChild(bodyDiv);

        // Display other details like class, subject, chapter if they exist
        let otherMetaInfoHtml = '<small class="qb-item-details">';
        let hasOtherMeta = false;
        if(qData.class) { otherMetaInfoHtml += `<strong>Cl:</strong> ${qData.class} `; hasOtherMeta = true; }
        if(qData.subject) { otherMetaInfoHtml += `<strong>Sub:</strong> ${qData.subject} `; hasOtherMeta = true; }
        if(qData.chapter) { otherMetaInfoHtml += `<strong>Ch:</strong> ${qData.chapter} `; hasOtherMeta = true; }
        // Add marks/difficulty again only if NOT part of the main metaText already shown (i.e., no metaLine)
        if (!qData.metaLine && qData.marks) { otherMetaInfoHtml += `<strong>Marks:</strong> ${qData.marks} `; hasOtherMeta = true; }
        if (!qData.metaLine && qData.difficulty) { otherMetaInfoHtml += `<strong>Diff:</strong> ${qData.difficulty} ${qData.level ? '/L'+qData.level : ''} `; hasOtherMeta = true; }
        otherMetaInfoHtml += '</small>';
        if(hasOtherMeta) qTextContainer.innerHTML += otherMetaInfoHtml;


        card.appendChild(qTextContainer);
        outputDiv.appendChild(card);
    });

    if (window.MathJax) {
        MathJax.typesetPromise([outputDiv]).catch(err => console.error("MathJax error in QB rendering:", err));
    }
}

// ====== QUESTION BANK - ITEM EDIT/DELETE LOGIC ======
function handleQbItemClick(event) {
    const clickedQuestionItem = event.target.closest('.qb-item');
    
    // If clicking on an element that is part of edit controls, do nothing here
    if (event.target.closest('.qb-edit-controls')) return; 

    // If an edit mode is active and we click outside it or on a different item, cancel the active edit.
    if (activeQbEditControls && (!clickedQuestionItem || activeQbEditControls.parentElement !== clickedQuestionItem)) {
        const prevQuestionEl = activeQbEditControls.parentElement;
        if (prevQuestionEl && prevQuestionEl.dataset.questionDbId) {
            const questionDbId = prevQuestionEl.dataset.questionDbId;
            const cacheIndex = qbQuestionsCache.findIndex(q => q.id === questionDbId);
            if (cacheIndex !== -1) {
                disableQbQuestionEditMode(prevQuestionEl, questionDbId, cacheIndex, false); // false = don't save, just cancel UI changes
            }
        }
    }

    // Remove any existing action popup if clicking anywhere else or on a new item
    const existingPopup = document.getElementById('qb-item-action-popup');
    if (existingPopup) existingPopup.remove();

    if (clickedQuestionItem) {
        // Don't show popup if the item is already in edit mode
        if (clickedQuestionItem.classList.contains('editing-question-qb')) return;

        const questionDbId = clickedQuestionItem.dataset.questionDbId;
        const questionCacheIndex = qbQuestionsCache.findIndex(q => q.id === questionDbId);

        if (questionDbId && questionCacheIndex !== -1) {
            showQbItemActionPopup(clickedQuestionItem, questionDbId, questionCacheIndex);
        }
    }
}

function showQbItemActionPopup(targetElement, questionDbId, questionCacheIndex) {
    const existingPopup = document.getElementById('qb-item-action-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.id = 'qb-item-action-popup';
    popup.className = 'ai-question-popup'; // Reuse AI chat popup style for consistency

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.className = 'popup-edit-btn'; // Shared style
    editButton.onclick = (e) => {
        e.stopPropagation();
        enableQbQuestionEditMode(targetElement, questionDbId, questionCacheIndex);
        popup.remove();
    };

    // TODO: Add Delete Button for QB items as per requirements
    const deleteButtonQb = document.createElement('button');
    deleteButtonQb.textContent = 'Delete';
    deleteButtonQb.className = 'popup-delete-btn'; // Shared style
    deleteButtonQb.onclick = async (e) => {
        e.stopPropagation();
        const qDataToDelete = qbQuestionsCache[questionCacheIndex];
        if (confirm(`Permanently delete this question from the Question Bank?\n"${qDataToDelete.body.substring(0,70)}..."`)) {
            try {
                await db.collection("questions").doc(questionDbId).delete();
                qbQuestionsCache.splice(questionCacheIndex, 1); // Remove from cache
                filterAndDisplayQbQuestions(); // Refresh display
                alert("Question deleted successfully."); // TODO: Toast
            } catch (error) {
                console.error("Error deleting question from Firestore:", error);
                alert("Failed to delete question."); // TODO: Toast
            }
        }
        popup.remove();
    };

    popup.appendChild(editButton);
    popup.appendChild(deleteButtonQb); // Add the delete button
    document.body.appendChild(popup);

    // Positioning logic (same as AI chat popup)
    const rect = targetElement.getBoundingClientRect();
    popup.style.position = 'absolute';
    let popupLeft = window.scrollX + rect.left + rect.width + 5;
    let popupTop = window.scrollY + rect.top + (rect.height / 2) - (popup.offsetHeight / 2);
    if (popupLeft + popup.offsetWidth > window.innerWidth) { popupLeft = window.scrollX + rect.left - popup.offsetWidth - 5; }
    if (popupLeft < 0) { popupLeft = window.scrollX + rect.left + (rect.width / 2) - (popup.offsetWidth / 2); popupTop = window.scrollY + rect.bottom + 5; if (popupTop + popup.offsetHeight > window.innerHeight + window.scrollY) { popupTop = window.scrollY + rect.top - popup.offsetHeight - 5; }}
    if (popupTop < window.scrollY) popupTop = window.scrollY;
    if (popupTop + popup.offsetHeight > window.innerHeight + window.scrollY) { popupTop = window.innerHeight + window.scrollY - popup.offsetHeight; }
    popup.style.top = `${popupTop}px`; popup.style.left = `${popupLeft}px`;
}

function enableQbQuestionEditMode(questionElement, questionDbId, questionCacheIndex) {
    if (activeQbEditControls) { // Cancel any other active QB edit
        const prevQuestionEl = activeQbEditControls.parentElement;
        if (prevQuestionEl && prevQuestionEl.dataset.questionDbId) {
            const prevDbId = prevQuestionEl.dataset.questionDbId;
            const prevCacheIdx = qbQuestionsCache.findIndex(q => q.id === prevDbId);
            if (prevCacheIdx !== -1) {
                disableQbQuestionEditMode(prevQuestionEl, prevDbId, prevCacheIdx, false);
            }
        }
    }
    
    questionElement.classList.add('editing-question-qb'); // Specific class for QB item editing
    const questionData = qbQuestionsCache[questionCacheIndex];

    const textContainer = questionElement.querySelector('.qb-item-text-container');
    const metaDiv = textContainer.querySelector('.question-meta-ai'); // Reusing class for styling
    const bodyDiv = textContainer.querySelector('.question-text-ai'); // Reusing class for styling

    if (!metaDiv || !bodyDiv) { console.error("Meta or Body div not found for QB editing."); return; }

    // Set contentEditable text from the 'original' fields stored in cache for this edit session
    metaDiv.textContent = questionData.originalParsedMetaToEdit;
    bodyDiv.textContent = questionData.originalParsedBodyToEdit;
    
    metaDiv.contentEditable = true;
    bodyDiv.contentEditable = true;
    metaDiv.style.border = '1px dashed #007bff'; 
    bodyDiv.style.border = '1px dashed #007bff';
    metaDiv.focus();

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'qb-edit-controls q-edit-controls'; // Add both for potential style reuse
    
    const saveEditBtn = document.createElement('button');
    saveEditBtn.textContent = 'Save Changes';
    saveEditBtn.className = 'btn-small btn-save-edit'; // Shared style
    saveEditBtn.onclick = async (e) => {
        e.stopPropagation();
        await disableQbQuestionEditMode(questionElement, questionDbId, questionCacheIndex, true); // true = save
    };

    const cancelEditBtn = document.createElement('button');
    cancelEditBtn.textContent = 'Cancel';
    cancelEditBtn.className = 'btn-small btn-cancel-edit'; // Shared style
    cancelEditBtn.onclick = (e) => {
        e.stopPropagation();
        disableQbQuestionEditMode(questionElement, questionDbId, questionCacheIndex, false); // false = cancel
    };

    controlsDiv.appendChild(saveEditBtn);
    controlsDiv.appendChild(cancelEditBtn);
    questionElement.appendChild(controlsDiv); // Append controls to the question card
    activeQbEditControls = controlsDiv; 
}

async function disableQbQuestionEditMode(questionElement, questionDbId, questionCacheIndex, saveChanges) {
    if (!questionElement || !questionElement.classList.contains('editing-question-qb')) return;

    const questionDataFromCache = qbQuestionsCache[questionCacheIndex];
    const textContainer = questionElement.querySelector('.qb-item-text-container');
    const metaDiv = textContainer.querySelector('.question-meta-ai');
    const bodyDiv = textContainer.querySelector('.question-text-ai');
    
    if (!metaDiv || !bodyDiv) return;

    if (saveChanges) {
        const newMetaText = metaDiv.innerText.trim();
        const newBodyText = bodyDiv.innerText.trim();
        
        const updateData = {
            body: newBodyText,      // Updated body
            metaLine: newMetaText,  // Store the full edited meta line
            difficulty: null, level: null, marks: null // Reset and re-parse from metaLine
        };

        // Re-parse difficulty, level, marks from the newMetaText
        const metaRegex = /^(Q\s*(\d+):\s*([^,/]+?)(?:\/Level\s*(\d+))?,\s*(\d+)\s*Marks)/im;
        const metaMatch = newMetaText.match(metaRegex);
        if (metaMatch) {
            updateData.difficulty = metaMatch[3]?.trim();
            updateData.level = metaMatch[4] ? parseInt(metaMatch[4].trim(), 10) : null;
            updateData.marks = metaMatch[5] ? parseInt(metaMatch[5].trim(), 10) : null;
        } else {
            console.warn("Meta line may be malformed after QB edit, structured fields might be null:", newMetaText);
        }
        // Update the 'text' field if your Firestore structure relies on it (e.g., for full text search or legacy)
        // It's good practice to keep 'text' consistent if it's a concatenation of meta and body.
        updateData.text = newMetaText + "\n" + newBodyText;


        try {
            await db.collection("questions").doc(questionDbId).update(updateData);
            // Update cache with new data and also update the 'original' fields for subsequent edits
            qbQuestionsCache[questionCacheIndex] = {
                ...questionDataFromCache, // Keep other fields like class, subject, chapter, id
                ...updateData, // Apply all updated fields (body, metaLine, diff, lvl, marks, text)
                originalParsedMetaToEdit: updateData.metaLine, // New baseline for next edit's "cancel"
                originalParsedBodyToEdit: updateData.body    // New baseline
            };
            alert("Question updated successfully in Question Bank!"); // TODO: Toast
        } catch (error) {
            console.error("Error updating question in Firestore:", error);
            alert("Failed to update question. Please try again."); // TODO: Toast
            // On failure, revert UI to what was originally loaded for this edit session
            metaDiv.textContent = questionDataFromCache.originalParsedMetaToEdit;
            bodyDiv.textContent = questionDataFromCache.originalParsedBodyToEdit;
            // Do not remove edit mode on DB save failure, allow user to retry or cancel.
            return; // Exit here to keep edit mode active
        }
    } else { // Cancelled, revert UI to original stored in cache for this edit attempt
        metaDiv.textContent = questionDataFromCache.originalParsedMetaToEdit;
        bodyDiv.textContent = questionDataFromCache.originalParsedBodyToEdit;
    }

    metaDiv.contentEditable = false;
    bodyDiv.contentEditable = false;
    metaDiv.style.border = 'none';
    bodyDiv.style.border = 'none';
    questionElement.classList.remove('editing-question-qb');
    
    const controlsDiv = questionElement.querySelector('.qb-edit-controls');
    if (controlsDiv) controlsDiv.remove();
    activeQbEditControls = null;

    filterAndDisplayQbQuestions(); // Refresh the QB display from cache to show changes/reversions
}

// ====== EXAM BUILDER - FORM UI & INITIALIZATION ======
// `examSectionsData` is a global array to store section configurations.
// `examBuilderFormConfig` is a global object for dropdown options.

async function updateEbChapterOptions() {
    const classVal = document.getElementById('eb-class')?.value;
    const subjectVal = document.getElementById('eb-subject')?.value;
    const chaptersSelect = document.getElementById('eb-chapters');

    if (!chaptersSelect) return;
    chaptersSelect.innerHTML = '<option value="" disabled>Loading chapters...</option>'; // Placeholder
    chaptersSelect.disabled = true;

    if (classVal && subjectVal && currentUserProfile) {
        try {
            const querySnapshot = await db.collection('questions')
                .where('createdBy', '==', currentUserProfile.uid)
                .where('class', '==', classVal)
                .where('subject', '==', subjectVal)
                .get();

            const chapters = new Set();
            querySnapshot.forEach(doc => {
                if (doc.data().chapter) {
                    chapters.add(doc.data().chapter.trim());
                }
            });

            chaptersSelect.innerHTML = ''; // Clear previous options
            if (chapters.size === 0) {
                chaptersSelect.innerHTML = '<option value="" disabled>No chapters found for this class/subject</option>';
            } else {
                chapters.forEach(chapter => {
                    const option = document.createElement('option');
                    option.value = chapter;
                    option.textContent = chapter;
                    chaptersSelect.appendChild(option);
                });
                chaptersSelect.disabled = false;
            }
        } catch (error) {
            console.error("Error fetching chapters for Exam Builder:", error);
            chaptersSelect.innerHTML = '<option value="" disabled>Error loading chapters</option>';
        }
    } else {
        chaptersSelect.innerHTML = '<option value="" disabled>Select Class and Subject first</option>';
    }
}


function loadExamBuilderForm() {
    const examBuilderContainer = document.getElementById('exam-builder-container');
    if (!examBuilderContainer) { console.error("Exam Builder container not found!"); return; }

    examSectionsData = []; // Reset sections data when form is loaded

    let classDropdownHTML = aiGeneratorConfig.classes.map(c => `<div data-value="${c}">${c}</div>`).join('');
    let subjectDropdownHTML = aiGeneratorConfig.subjectsBase.map(s => `<div data-value="${s}">${s}</div>`).join(''); // Use base, specific filtering later if needed
    let examNameDropdownHTML = examBuilderFormConfig.examNameOptions.map(e => `<div data-value="${e}">${e}</div>`).join('');
    let examTypeDropdownHTML = examBuilderFormConfig.examTypeOptions.map(e => `<div data-value="${e}">${e}</div>`).join('');
    let mcqLevelDropdownHTML = examBuilderFormConfig.mcqLevelOptions.map(lvl => `<div data-value="${lvl}">${lvl}</div>`).join('');
    let maxMarksDropdownHTML = examBuilderFormConfig.maxMarksOptions.map(m => `<div data-value="${m}">${m}</div>`).join('');
    let difficultyDropdownHTML = examBuilderFormConfig.difficultyOptions.map(d => `<div data-value="${d}">${d}</div>`).join('');

    examBuilderContainer.innerHTML = `
        <h2>Create New Exam Paper</h2>
        <form id="exam-builder-form">
            <div class="form-grid">
                <div class="form-group">
                    <label for="eb-class">Class:</label>
                    <div id="eb-class-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-class" name="ebClass" value="${aiGeneratorConfig.classes[0]}">
                        <div class="selected-option">${aiGeneratorConfig.classes[0]}</div>
                        <div class="dropdown-options">${classDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="eb-subject">Subject:</label>
                    <div id="eb-subject-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-subject" name="ebSubject" value="${aiGeneratorConfig.subjectsBase[0]}">
                        <div class="selected-option">${aiGeneratorConfig.subjectsBase[0]}</div>
                        <div class="dropdown-options">${subjectDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group form-group-span-2">
                    <label for="eb-chapters">Chapters (Ctrl/Cmd + Click to select multiple from your Question Bank):</label>
                    <select id="eb-chapters" name="ebChapters" multiple class="qb-standard-select-multiple" style="min-height: 100px;" disabled>
                        <option value="" disabled>Select Class and Subject first</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="eb-exam-name">Exam Name:</label>
                    <div id="eb-exam-name-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-exam-name" name="ebExamName" value="${examBuilderFormConfig.examNameOptions[0]}">
                        <div class="selected-option">${examBuilderFormConfig.examNameOptions[0]}</div>
                        <div class="dropdown-options">${examNameDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="eb-exam-type">Exam Type:</label>
                    <div id="eb-exam-type-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-exam-type" name="ebExamType" value="${examBuilderFormConfig.examTypeOptions[0]}">
                        <div class="selected-option">${examBuilderFormConfig.examTypeOptions[0]}</div>
                        <div class="dropdown-options">${examTypeDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group" id="eb-mcq-level-group" style="display: ${(examBuilderFormConfig.examTypeOptions[0] === 'MCQs' || examBuilderFormConfig.examTypeOptions[0] === 'Both') ? 'block' : 'none'};">
                    <label for="eb-mcq-level">MCQ Level (Overall):</label>
                    <div id="eb-mcq-level-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-mcq-level" name="ebMcqLevel" value="${examBuilderFormConfig.mcqLevelOptions[0]}">
                        <div class="selected-option">${examBuilderFormConfig.mcqLevelOptions[0]}</div>
                        <div class="dropdown-options">${mcqLevelDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="eb-max-marks">Max Marks:</label>
                    <div id="eb-max-marks-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-max-marks" name="ebMaxMarks" value="${examBuilderFormConfig.maxMarksOptions[0]}">
                        <div class="selected-option">${examBuilderFormConfig.maxMarksOptions[0]}</div>
                        <div class="dropdown-options">${maxMarksDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="eb-difficulty">Overall Difficulty:</label>
                    <div id="eb-difficulty-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-difficulty" name="ebDifficulty" value="${examBuilderFormConfig.difficultyOptions[0]}">
                        <div class="selected-option">${examBuilderFormConfig.difficultyOptions[0]}</div>
                        <div class="dropdown-options">${difficultyDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group form-group-span-2" id="eb-difficulty-percentages-group" style="display: ${(examBuilderFormConfig.difficultyOptions[0] === 'Mixed By Percentage') ? 'block' : 'none'};">
                    <label>Difficulty Mix (% - must total 100%):</label>
                    <div class="difficulty-mix-inputs">
                        <div><label for="eb-diff-easy-perc">Easy:</label><input type="number" id="eb-diff-easy-perc" name="ebDiffEasyPerc" min="0" max="100" placeholder="%" value="0"></div>
                        <div><label for="eb-diff-medium-perc">Medium:</label><input type="number" id="eb-diff-medium-perc" name="ebDiffMediumPerc" min="0" max="100" placeholder="%" value="0"></div>
                        <div><label for="eb-diff-hard-perc">Difficult:</label><input type="number" id="eb-diff-hard-perc" name="ebDiffHardPerc" min="0" max="100" placeholder="%" value="0"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="eb-time">Time Allowed:</label>
                    <input type="text" id="eb-time" name="ebTime" placeholder="e.g., 2 hours, 90 minutes">
                </div>
                <div class="form-group">
                    <label for="eb-date">Date of Exam:</label>
                    <input type="date" id="eb-date" name="ebDate">
                </div>
                <div class="form-group form-group-span-2">
                    <label for="eb-instructions">General Instructions (Optional):</label>
                    <textarea id="eb-instructions" name="ebInstructions" rows="3" placeholder="Enter general instructions for the exam..."></textarea>
                </div>
            </div>

            <div id="eb-sections-container" class="sections-container">
                <h3>Exam Sections</h3>
                <div id="eb-sections-list">
                    {/* Dynamically added sections will go here */}
                </div>
                <button type="button" id="eb-add-section-btn" class="btn-small" style="margin-top:10px;">
                    <i class="fas fa-plus"></i> Add Section
                </button>
            </div>

            <button type="submit" class="btn" style="margin-top: 20px;">Proceed to Select Questions</button>
        </form>
    `;

    setupCustomDropdown('eb-class-dropdown', 'eb-class', updateEbChapterOptions);
    setupCustomDropdown('eb-subject-dropdown', 'eb-subject', updateEbChapterOptions);
    setupCustomDropdown('eb-exam-name-dropdown', 'eb-exam-name');
    setupCustomDropdown('eb-exam-type-dropdown', 'eb-exam-type', (value) => {
        const mcqLevelGroup = document.getElementById('eb-mcq-level-group');
        if (mcqLevelGroup) mcqLevelGroup.style.display = (value === 'MCQs' || value === 'Both') ? 'block' : 'none';
    });
    setupCustomDropdown('eb-mcq-level-dropdown', 'eb-mcq-level');
    setupCustomDropdown('eb-max-marks-dropdown', 'eb-max-marks');
    setupCustomDropdown('eb-difficulty-dropdown', 'eb-difficulty', (value) => {
        const difficultyPercGroup = document.getElementById('eb-difficulty-percentages-group');
        if (difficultyPercGroup) difficultyPercGroup.style.display = (value === 'Mixed By Percentage') ? 'block' : 'none';
    });

    document.getElementById('eb-add-section-btn').onclick = addNewExamSection;
    document.getElementById('exam-builder-form').onsubmit = handleExamBuilderFormSubmit; // Changed to call a new handler

    updateEbChapterOptions(); // Initial call to populate chapters if class/subject are pre-selected
    if (examSectionsData.length === 0) { // Add one default section if none exist
        addNewExamSection();
    } else { // Re-render existing sections if navigating back (data might be stale in DOM)
        const sectionsListDiv = document.getElementById('eb-sections-list');
        sectionsListDiv.innerHTML = '';
        examSectionsData.forEach((sectionData, index) => {
            const sectionElement = createSectionUI(sectionData, index);
            sectionsListDiv.appendChild(sectionElement);
            initializeSectionDropdowns(index); // Re-initialize dropdowns for this section
        });
    }
}

// ====== EXAM BUILDER - SECTION MANAGEMENT LOGIC ======
function createSectionUI(section, index) {
    const sectionId = `eb-section-${index}`; 
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'exam-section-item';
    sectionDiv.id = sectionId;
    sectionDiv.dataset.sectionIndex = index;

    let sectionQTypeDropdownHTML = examBuilderFormConfig.sectionQuestionTypeOptions.map(qt => `<div data-value="${qt}">${qt}</div>`).join('');
    let sectionMcqLevelDropdownHTML = examBuilderFormConfig.mcqLevelOptions.map(lvl => `<div data-value="${lvl}">${lvl}</div>`).join('');
    
    const showMcqLevelInitially = (section.questionType === 'MCQs');

    sectionDiv.innerHTML = `
        <h4>Section ${index + 1}: <input type="text" name="sectionTitle[${index}]" class="eb-section-title-input" placeholder="Section Title (e.g., Section A)" value="${section.title || `Section ${index + 1}`}"></h4>
        <div class="form-grid section-grid">
            <div class="form-group form-group-span-2">
                <label for="${sectionId}-instructions">Instructions (Optional):</label>
                <textarea id="${sectionId}-instructions" name="sectionInstructions[${index}]" rows="2" placeholder="Instructions for this section...">${section.instructions || ''}</textarea>
            </div>
            <div class="form-group">
                <label for="${sectionId}-qtype">Question Type:</label>
                <div id="${sectionId}-qtype-dropdown" class="custom-dropdown">
                    <input type="hidden" id="${sectionId}-qtype-value" name="sectionQuestionType[${index}]" value="${section.questionType || examBuilderFormConfig.sectionQuestionTypeOptions[0]}">
                    <div class="selected-option">${section.questionType || examBuilderFormConfig.sectionQuestionTypeOptions[0]}</div>
                    <div class="dropdown-options">${sectionQTypeDropdownHTML}</div>
                </div>
            </div>
            <div class="form-group" id="${sectionId}-mcq-level-group" style="display: ${showMcqLevelInitially ? 'block' : 'none'};">
                <label for="${sectionId}-mcq-level">MCQ Level (Section):</label>
                <div id="${sectionId}-mcq-level-dropdown" class="custom-dropdown">
                    <input type="hidden" id="${sectionId}-mcq-level-value" name="sectionMcqLevel[${index}]" value="${section.mcqLevel || examBuilderFormConfig.mcqLevelOptions[0]}">
                    <div class="selected-option">${section.mcqLevel || examBuilderFormConfig.mcqLevelOptions[0]}</div>
                    <div class="dropdown-options">${sectionMcqLevelDropdownHTML}</div>
                </div>
            </div>
            <div class="form-group">
                <label for="${sectionId}-num-questions">Number of Questions:</label>
                <input type="number" id="${sectionId}-num-questions" name="sectionNumQuestions[${index}]" min="1" placeholder="e.g., 5" value="${section.numQuestions || ''}">
            </div>
            <div class="form-group">
                <label for="${sectionId}-marks-per-q">Marks per Question:</label>
                <input type="number" id="${sectionId}-marks-per-q" name="sectionMarksPerQuestion[${index}]" min="1" placeholder="e.g., 2" value="${section.marksPerQuestion || ''}">
            </div>
            <div class="form-group">
                <button type="button" class="btn-small btn-remove-section" data-remove-index="${index}">
                    <i class="fas fa-trash-alt"></i> Remove Section
                </button>
            </div>
        </div>
    `;
    // Add event listeners for input changes to update examSectionsData
    sectionDiv.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('input', () => updateSectionDataFromUI(index));
    });
    return sectionDiv;
}

function initializeSectionDropdowns(sectionIndex) {
    const sectionId = `eb-section-${sectionIndex}`;
    setupCustomDropdown(`${sectionId}-qtype-dropdown`, `${sectionId}-qtype-value`, (selectedQType) => {
        const mcqLevelGroupInSection = document.getElementById(`${sectionId}-mcq-level-group`);
        if (mcqLevelGroupInSection) {
            mcqLevelGroupInSection.style.display = (selectedQType === 'MCQs') ? 'block' : 'none';
        }
        updateSectionDataFromUI(sectionIndex); // Update data on change
    });
    setupCustomDropdown(`${sectionId}-mcq-level-dropdown`, `${sectionId}-mcq-level-value`, () => {
        updateSectionDataFromUI(sectionIndex); // Update data on change
    });
}


function addNewExamSection() {
    const defaultSectionQType = examBuilderFormConfig.sectionQuestionTypeOptions[0];
    const newSectionData = {
        title: `Section ${examSectionsData.length + 1}`,
        instructions: "",
        questionType: defaultSectionQType, 
        mcqLevel: examBuilderFormConfig.mcqLevelOptions[0],
        numQuestions: "",
        marksPerQuestion: ""
    };
    examSectionsData.push(newSectionData);
    
    const sectionsListDiv = document.getElementById('eb-sections-list');
    const sectionIndex = examSectionsData.length - 1;
    const sectionElement = createSectionUI(newSectionData, sectionIndex);
    sectionsListDiv.appendChild(sectionElement);
    initializeSectionDropdowns(sectionIndex);

    sectionElement.querySelector('.btn-remove-section').onclick = function() {
        const indexToRemove = parseInt(this.dataset.removeIndex, 10);
        removeExamSection(indexToRemove);
    };
}

function removeExamSection(indexToRemove) {
    if (indexToRemove < 0 || indexToRemove >= examSectionsData.length) return;
    examSectionsData.splice(indexToRemove, 1); 
    // Re-render all sections to update indices and button data attributes
    const sectionsListDiv = document.getElementById('eb-sections-list');
    sectionsListDiv.innerHTML = ''; 
    examSectionsData.forEach((sectionData, newIndex) => {
        // Update section title if it was default "Section X"
        if (sectionData.title === `Section ${indexToRemove + 1}` || sectionData.title === `Section ${newIndex + 2}`) { // Adjust for old/new default names
            sectionData.title = `Section ${newIndex + 1}`;
        }
        const sectionElement = createSectionUI(sectionData, newIndex);
        sectionsListDiv.appendChild(sectionElement);
        initializeSectionDropdowns(newIndex);
        sectionElement.querySelector('.btn-remove-section').onclick = function() {
            removeExamSection(newIndex); 
        };
    });
}

function updateSectionDataFromUI(sectionIndex) {
    const sectionElement = document.getElementById(`eb-section-${sectionIndex}`);
    if (!sectionElement || !examSectionsData[sectionIndex]) return;

    examSectionsData[sectionIndex].title = sectionElement.querySelector(`input[name="sectionTitle[${sectionIndex}]"]`).value;
    examSectionsData[sectionIndex].instructions = sectionElement.querySelector(`textarea[name="sectionInstructions[${sectionIndex}]"]`).value;
    examSectionsData[sectionIndex].questionType = sectionElement.querySelector(`input[id="eb-section-${sectionIndex}-qtype-value"]`).value;
    if (examSectionsData[sectionIndex].questionType === 'MCQs') {
        examSectionsData[sectionIndex].mcqLevel = sectionElement.querySelector(`input[id="eb-section-${sectionIndex}-mcq-level-value"]`).value;
    } else {
        examSectionsData[sectionIndex].mcqLevel = null; // Clear if not MCQs
    }
    examSectionsData[sectionIndex].numQuestions = sectionElement.querySelector(`input[name="sectionNumQuestions[${sectionIndex}]"]`).value;
    examSectionsData[sectionIndex].marksPerQuestion = sectionElement.querySelector(`input[name="sectionMarksPerQuestion[${sectionIndex}]"]`).value;
}


// ====== EXAM BUILDER - FORM SUBMISSION & DATA HANDLING ======
function handleExamBuilderFormSubmit(e) {
    e.preventDefault();
    const form = e.target; // exam-builder-form
    const mainFormData = new FormData(form);
    const examData = {};

    // Collect main form data (excluding section-specific data handled by examSectionsData)
    for (let [key, value] of mainFormData.entries()) {
        if (key.startsWith('section')) continue; // Skip section fields here

        if (key === 'ebChapters') { // Handle multi-select for chapters
            if (!examData[key]) examData[key] = [];
            examData[key].push(value);
        } else if (key.endsWith('Perc')) { // Handle percentage inputs
            examData[key] = value ? parseFloat(value) : 0; // Convert to number, default to 0
        } else {
            examData[key] = value;
        }
    }

    // Get values from hidden inputs of main form custom dropdowns that FormData might miss
    examData['ebClass'] = document.getElementById('eb-class').value;
    examData['ebSubject'] = document.getElementById('eb-subject').value;
    examData['ebExamName'] = document.getElementById('eb-exam-name').value;
    examData['ebExamType'] = document.getElementById('eb-exam-type').value;
    if (examData['ebExamType'] === 'MCQs' || examData['ebExamType'] === 'Both') {
        examData['ebMcqLevel'] = document.getElementById('eb-mcq-level').value;
    } else {
        examData['ebMcqLevel'] = null;
    }
    examData['ebMaxMarks'] = document.getElementById('eb-max-marks').value;
    examData['ebDifficulty'] = document.getElementById('eb-difficulty').value;

    // If not "Mixed By Percentage", nullify percentage fields explicitly
    if (examData['ebDifficulty'] !== 'Mixed By Percentage') {
        examData['ebDiffEasyPerc'] = null;
        examData['ebDiffMediumPerc'] = null;
        examData['ebDiffHardPerc'] = null;
    } else {
        // Validate percentages total 100 if mixed
        const easyP = examData['ebDiffEasyPerc'] || 0;
        const medP = examData['ebDiffMediumPerc'] || 0;
        const hardP = examData['ebDiffHardPerc'] || 0;
        if (easyP + medP + hardP !== 100) {
            alert("Difficulty percentages must total 100%."); // TODO: Toast
            return;
        }
    }

    // Ensure all section data is up-to-date from the UI before assigning
    examSectionsData.forEach((_, index) => updateSectionDataFromUI(index));
    examData.sections = JSON.parse(JSON.stringify(examSectionsData)); // Deep copy

    // Validate that each section has numQuestions and marksPerQuestion
    for (let i = 0; i < examData.sections.length; i++) {
        const section = examData.sections[i];
        if (!section.numQuestions || parseInt(section.numQuestions) <= 0) {
            alert(`Please specify a valid number of questions for Section ${i + 1}.`); // TODO: Toast
            return;
        }
        if (!section.marksPerQuestion || parseFloat(section.marksPerQuestion) <= 0) {
            alert(`Please specify valid marks per question for Section ${i + 1}.`); // TODO: Toast
            return;
        }
    }
    
    console.log("Exam Builder Form Data Collected:", examData);
    alert("Form submission initiated. Next step is fetching questions (pending implementation)."); // TODO: Toast & proceed
    // TODO: Transition to the next phase: Question selection UI based on examData
};

// ====== CUSTOM DROPDOWN WIDGET LOGIC ======
function optionsContainerListener(optionsContainer, selectedDisplay, hiddenInput, dropdownElement, changeCallback) {
    if (!optionsContainer) return;
    // Clone and replace to effectively remove old listeners before adding new ones
    const newOptionsContainer = optionsContainer.cloneNode(true); 
    optionsContainer.parentNode.replaceChild(newOptionsContainer, optionsContainer);
    
    newOptionsContainer.querySelectorAll("div[data-value]").forEach(opt => {
        opt.onclick = function (event) {
            event.stopPropagation(); // Prevent click from bubbling to parent dropdown
            selectedDisplay.textContent = opt.textContent;
            hiddenInput.value = opt.dataset.value;
            dropdownElement.classList.remove("open"); // Close this dropdown
            newOptionsContainer.style.display = "none"; // Hide options
            if (changeCallback) {
                changeCallback(opt.dataset.value); // Execute callback with new value
            }
            // Dispatch a change event on the hidden input for any other listeners
            hiddenInput.dispatchEvent(new Event('change', { bubbles: true })); 
        };
    });
}

function setupCustomDropdown(dropdownId, hiddenInputId, changeCallback = null) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) { console.warn(`Dropdown with ID '${dropdownId}' not found.`); return; }

    const selectedDisplay = dropdown.querySelector(".selected-option");
    const optionsContainer = dropdown.querySelector(".dropdown-options");
    const hiddenInput = document.getElementById(hiddenInputId); 

    if (!selectedDisplay || !optionsContainer || !hiddenInput) {
        console.warn(`Essential parts missing for custom dropdown '${dropdownId}'. Check .selected-option, .dropdown-options, or hidden input '${hiddenInputId}'.`);
        return;
    }

    selectedDisplay.onclick = function (event) {
        event.stopPropagation(); // Prevent global click listener from closing it immediately
        const isOpenCurrently = dropdown.classList.contains("open");
      closeAllDropdowns(dropdownId); // Close others before toggling this one
      if (!isOpenCurrently) { // If it was closed, now open it
        dropdown.classList.add("open");
        optionsContainer.style.display = "block";
      } // If it was open, closeAllDropdowns already handled it (or it's the one excluded)
    };
    optionsContainerListener(optionsContainer, selectedDisplay, hiddenInput, dropdown, changeCallback);
}

function closeAllDropdowns(excludeDropdownId = null) {
    document.querySelectorAll(".custom-dropdown.open").forEach(dropdown => {
        if (dropdown.id !== excludeDropdownId) {
            dropdown.classList.remove("open");
            const options = dropdown.querySelector(".dropdown-options");
            if (options) options.style.display = "none";
        }
    });
}

// Global click listener to close dropdowns and popups
document.addEventListener("click", function (e) { 
    // Close custom dropdowns if click is outside
    if (!e.target.closest('.custom-dropdown')) {
        closeAllDropdowns();
    }

    // Close AI/QB action popups if click is outside relevant areas
    if (!e.target.closest('.ai-question-popup') &&
        !e.target.closest('.ai-question-item') && // Clicking on item itself should open popup, not close it
        !e.target.closest('.qb-item')) { // Same for QB items
        const popupsToClose = ['ai-question-editor-popup', 'qb-item-action-popup'];
        popupsToClose.forEach(popupId => {
            const existingPopup = document.getElementById(popupId);
            if (existingPopup) existingPopup.remove();
        });
    }
});


// ====== APPLICATION INITIALIZATION (ONLOAD/DOMCONTENTLOADED) ======
window.onload = () => { 
  // Fallback: if after 2 seconds, splash is still visible and no user is logged in, force login UI
  setTimeout(() => {
    if (splash && !splash.classList.contains('hidden') && !auth.currentUser) {
        hideSplashAndShowLogin();
    }
  }, 2000);

  // Initial section determination based on hash or auth state
  // This is largely handled by onAuthStateChanged now, but can be a fallback
  const initialHash = window.location.hash.substring(1);
  if (initialHash && document.getElementById(initialHash)) {
    // onAuthStateChanged will typically take precedence if user logs in/out
    // but if already logged in and navigating via hash, this might be useful
    // showSection(initialHash, false); // false to not push to history again
  } else if (!auth.currentUser) {
    // showSection('login-section', false); // Already handled by onAuthStateChanged
  }
};

document.addEventListener("DOMContentLoaded", () => {
    // The main logic for showing initial section is now better handled by
    // onAuthStateChanged and the popstate listener.
    // Any specific DOMContentLoaded setup not tied to auth state can go here.

    // Example: If there's a specific element that needs an event listener from the start
    // const someGlobalButton = document.getElementById('someGlobalButtonId');
    // if (someGlobalButton) {
    //     someGlobalButton.onclick = () => { /* ... */ };
    // }
});
