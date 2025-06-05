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

let currentUserProfile = null;

const aiGeneratorConfig = {
    classes: ["3rd Class", "4th Class", "5th Class", "6th Class", "7th Class", "8th Class", "9th Class", "10th Class"],
    subjectsBase: ["Telugu", "Hindi", "English 1", "English 2", "Math 1", "Math 1 IIT", "Math 2", "Math IIT", "Physics", "Physics IIT & NEET", "Chemistry", "Chemistry IIT & NEET", "Biology", "Biology NEET", "Social"],
    questionTypes: ["MCQs", "Descriptive"],
    getSubjectsForClass: function(className) { return this.subjectsBase; }
};

// ====== SECTION NAVIGATION ======
function showSection(id, pushState = true) {
  document.querySelectorAll('.app-section').forEach(sec => sec.style.display = 'none');
  const sectionElement = document.getElementById(id);
  if (sectionElement) { sectionElement.style.display = 'block'; }
  else { console.error(`Section with id '${id}' not found.`); }
  if (pushState) { history.pushState({ section: id }, '', `#${id}`); }
}

// ====== SPLASH AND LOGIN ======
const splash = document.getElementById('splash');
const loginSection = document.getElementById('login-section');
function hideSplashAndShowLogin() { if (splash) splash.classList.add('hidden'); showLoginUI(); }
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

// ====== AUTH FUNCTIONS ======
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

// ====== AUTH STATE HANDLING ======
auth.onAuthStateChanged(user => { 
  setTimeout(async () => {
    if (splash) splash.classList.add('hidden');
    if (user) {
      try {
        const userDocRef = db.collection("users").doc(user.uid);
        const doc = await userDocRef.get();
        if (doc.exists) {
          currentUserProfile = { uid: user.uid, email: user.email, ...user.providerData[0], ...doc.data() };
          if (!currentUserProfile.role) { await userDocRef.set({ role: 'teacher' }, { merge: true }); currentUserProfile.role = 'teacher'; }
        } else { 
          const defaultDisplayName = user.displayName || user.email.split('@')[0];
          currentUserProfile = { uid: user.uid, email: user.email, displayName: defaultDisplayName, role: 'teacher' };
          await userDocRef.set({ displayName: defaultDisplayName, email: user.email, role: 'teacher', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
      } catch (error) {
        console.error("Error user profile:", error);
        const displayName = user.displayName || user.email.split('@')[0]; 
        currentUserProfile = { uid: user.uid, email: user.email, displayName: displayName, role: 'teacher' };
      }
      showSection('dashboard-section'); history.replaceState({ section: 'dashboard-section' }, '', '#dashboard-section'); loadDashboard();
    } else {
      currentUserProfile = null; showLoginUI(); history.replaceState({ section: 'login-section' }, '', '#login-section');
    }
  }, 1000); 
});
window.onload = () => { 
  setTimeout(() => { if (splash && !splash.classList.contains('hidden') && !auth.currentUser) { hideSplashAndShowLogin(); } }, 2000);
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

  if (!currentUserProfile) { auth.signOut(); return; }
  let userDisplayName = currentUserProfile.displayName || currentUserProfile.email.split('@')[0];
  displayNameSpan.textContent = userDisplayName;

  settingsBtn.onclick = function () {
    editNameInput.value = currentUserProfile.displayName || currentUserProfile.email.split('@')[0];
    settingsPopup.style.display = "flex"; editNameInput.focus();
  };
  closeSettingsBtn.onclick = function () { settingsPopup.style.display = "none"; };
  saveNameBtn.onclick = async () => {
    const newName = editNameInput.value.trim();
    if (!newName) return alert("Please enter your name.");
    try {
      await db.collection("users").doc(currentUserProfile.uid).set({ displayName: newName }, { merge: true });
      if (auth.currentUser.displayName !== newName) { 
        await auth.currentUser.updateProfile({ displayName: newName });
      }
      currentUserProfile.displayName = newName; displayNameSpan.textContent = newName;
      settingsPopup.style.display = "none"; alert("Name updated!");
    } catch (e) {
      console.error("Failed to save name:", e); alert("Failed to save name. Try again.");
    }
  };
  logoutBtn.onclick = () => { auth.signOut().then(() => { currentUserProfile = null; }); };
  settingsPopup.addEventListener("click", (e) => { if (e.target === settingsPopup) settingsPopup.style.display = "none"; });

  document.getElementById("gen-ai-btn").onclick = () => { showSection('ai-question-section'); loadAiQuestionGeneratorForm(); };
  document.getElementById("qbank-btn").onclick = () => { showSection('qbank-section'); loadQuestionBank(); };
  document.getElementById("exam-builder-btn").onclick = () => { 
    showSection('exam-builder-section'); 
    loadExamBuilderForm(); // Call new function to load Exam Builder UI
  };
}

// ====== AI QUESTION GENERATOR SECTION ======
function loadAiQuestionGeneratorForm() { 
    const aiReviewContainer = document.getElementById('ai-review-container');
    if (!aiReviewContainer) { console.error("AI Review Container not found!"); return; }
    let classDropdownHTML = aiGeneratorConfig.classes.map(c => `<div data-value="${c}">${c}</div>`).join('');
    let initialSubjects = aiGeneratorConfig.getSubjectsForClass(aiGeneratorConfig.classes[0]);
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
    setupCustomDropdown('class-dropdown-ai', 'class-value-ai', (selectedClass) => {
        const subjectOptionsContainer = document.querySelector('#subject-dropdown-ai .dropdown-options');
        const subjectSelectedOption = document.querySelector('#subject-dropdown-ai .selected-option');
        const subjectHiddenInput = document.getElementById('subject-value-ai');
        if (!subjectOptionsContainer || !subjectSelectedOption || !subjectHiddenInput) return;
        const newSubjects = aiGeneratorConfig.getSubjectsForClass(selectedClass);
        subjectOptionsContainer.innerHTML = newSubjects.map(s => `<div data-value="${s}">${s}</div>`).join('');
        if (newSubjects.length > 0) { subjectSelectedOption.textContent = newSubjects[0]; subjectHiddenInput.value = newSubjects[0]; }
        else { subjectSelectedOption.textContent = 'No Subjects Available'; subjectHiddenInput.value = ''; }
        optionsContainerListener(subjectOptionsContainer, subjectSelectedOption, subjectHiddenInput, document.getElementById('subject-dropdown-ai'), null);
    });
    setupCustomDropdown('subject-dropdown-ai', 'subject-value-ai');
    setupCustomDropdown('qtype-dropdown-ai', 'qtype-value-ai');
    document.getElementById("ai-setup-form").onsubmit = function (e) {
        e.preventDefault();
        const sessionParams = {
            class: document.getElementById('class-value-ai').value, subject: document.getElementById('subject-value-ai').value,
            questionType: document.getElementById('qtype-value-ai').value, chapter: document.getElementById('chapter-input-ai').value.trim(),
        };
        if (!sessionParams.chapter) { alert("Please enter a chapter."); return; }
        if (!sessionParams.subject) { alert("Please select a subject."); return; } 
        loadAiChatInterface(sessionParams);
    };
}

// Store reference to currently active question edit controls if any
let activeQuestionEditControls = null;

function loadAiChatInterface(sessionParams) {
    const aiReviewContainer = document.getElementById('ai-review-container');
    if (!aiReviewContainer) return;

    currentSessionQuestions = []; 

    let fileInput = document.getElementById('image-upload-input-ai');
    if (!fileInput) {
        fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.id = 'image-upload-input-ai';
        fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput);
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
    const imageUploadInput = document.getElementById('image-upload-input-ai');

    saveAllBtnChat.onclick = async () => { /* ... as before (Save All logic) ... */ 
        if (!currentUserProfile) { alert("Please login."); return; }
        if (currentSessionQuestions.length === 0) { alert("No questions."); return; }
        saveAllBtnChat.disabled = true; saveAllBtnChat.textContent = "Saving...";
        let savedCount = 0, skippedCount = 0; const userId = currentUserProfile.uid;
        for (const qData of currentSessionQuestions) {
            if (!qData.parsedBody || !qData.class || !qData.subject || !qData.chapter) { skippedCount++; continue; }
            const duplicateQuery = db.collection("questions").where("body", "==", qData.parsedBody).where("class", "==", qData.class)
                .where("subject", "==", qData.subject).where("chapter", "==", qData.chapter).where("createdBy", "==", userId);
            const snapshot = await duplicateQuery.get();
            if (!snapshot.empty) { skippedCount++; continue; }
            try {
                await db.collection("questions").add({ text: qData.fullText, body: qData.parsedBody, metaLine: qData.parsedMeta,
                    difficulty: qData.difficulty, level: qData.level, marks: qData.marks, class: qData.class, subject: qData.subject,
                    chapter: qData.chapter, createdBy: userId, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
                savedCount++;
            } catch (error) { console.error("Error saving question:", error); }
        }
        alert(`${savedCount} saved. ${skippedCount} skipped.`); saveAllBtnChat.disabled = false; saveAllBtnChat.textContent = "Save All";
    };
    chatUploadBtn.onclick = () => { imageUploadInput.click(); };
    imageUploadInput.onchange = async function(event) { /* ... as before (Image Upload logic) ... */ 
        const file = event.target.files[0]; if (!file) return;
        if (!file.type.startsWith("image/")) { alert("Please upload an image."); event.target.value = null; return; }
        appendChatMessage(`Processing image: ${file.name}...`, 'system', chatMessagesArea);
        chatPromptInput.disabled = true; chatSendBtn.disabled = true; chatUploadBtn.disabled = true;
        const formData = new FormData(); formData.append('imageFile', file);
        try {
            const response = await fetch("/api/extract-from-image", { method: 'POST', body: formData });
            const result = await response.json();
            if (!response.ok) { throw new Error(result.error || `HTTP error ${response.status}`); }
            if (result.error) { appendChatMessage(`Error: ${result.error}`, 'error', chatMessagesArea); }
            else if (result.result) {
                appendChatMessage(`Extracted from ${file.name}:`, 'system', chatMessagesArea);
                parseAndDisplayAiQuestions(result.result, chatMessagesArea, sessionParams, currentSessionQuestions);
            } else { appendChatMessage("Empty/invalid response from image processing.", 'error', chatMessagesArea); }
        } catch (err) { appendChatMessage(`Failed: ${err.message}`, 'error', chatMessagesArea); }
        finally { chatPromptInput.disabled = false; chatSendBtn.disabled = false; chatUploadBtn.disabled = false; event.target.value = null; }
    };
    chatSendBtn.onclick = async function() { /* ... as before (Send Prompt logic) ... */ 
        const userPrompt = chatPromptInput.value.trim(); if (!userPrompt) return;
        appendChatMessage(userPrompt, 'user', chatMessagesArea); chatPromptInput.value = '';
        chatPromptInput.disabled = true; chatSendBtn.disabled = true; chatUploadBtn.disabled = true;
        // Ensure fullPromptForAI is correctly constructed as in previous versions
        const fullPromptForAI = `Based on the following setup:\nClass: ${sessionParams.class}\nSubject: ${sessionParams.subject}\nChapter: ${sessionParams.chapter}\nQuestion Type: ${sessionParams.questionType}\n\nUser request: "${userPrompt}"\n\nGenerate the questions.\nFormat each question EXACTLY like this:\nQ 1: Difficulty/Level X, Y Marks  (e.g., Q 1: Difficult/Level 3, 2 Marks OR Q 2: Easy/Level 1, 4 Marks. Ensure 'Level' is present if applicable, and 'Marks' is always present.)\nThe question text starts on the next line.\n\n- Ensure the first line for each question strictly follows the specified format: "Q <number>: <DifficultyName>/Level <LevelNumber>, <MarksValue> Marks".\n- DifficultyName can be Easy, Medium, Difficult, or similar. LevelNumber is optional but if present, include "/Level X". MarksValue is a number.\n- The question text itself begins on the very next line.\n- Do not use Markdown or extra hashes (###) in the question meta line or body, just plain text as shown.\n- Only give questions (NO solutions/answers).`;
        appendChatMessage("Generating...", 'system blink', chatMessagesArea);
        try {
            const response = await fetch("https://question-bank-lqsu.onrender.com/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: fullPromptForAI }) });
            const result = await response.json();
            const blinkMsg = chatMessagesArea.querySelector('.blinking-text.system-message'); if (blinkMsg) blinkMsg.remove();
            if (result.error) { appendChatMessage(`Error: ${result.error}`, 'error', chatMessagesArea); }
            else if (result.result) { parseAndDisplayAiQuestions(result.result, chatMessagesArea, sessionParams, currentSessionQuestions); }
            else { appendChatMessage("Empty/invalid AI response.", 'error', chatMessagesArea); }
        } catch (err) { 
             const blinkMsg = chatMessagesArea.querySelector('.blinking-text.system-message'); if (blinkMsg) blinkMsg.remove();
             appendChatMessage(`Request failed: ${err.message || 'Network error'}`, 'error', chatMessagesArea);
        } finally { 
            chatPromptInput.disabled = false; chatSendBtn.disabled = false; chatUploadBtn.disabled = false;
            chatPromptInput.focus();
        }
    };
    chatPromptInput.addEventListener('keypress', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSendBtn.click(); }});

    chatMessagesArea.addEventListener('click', function(event) {
        const clickedQuestionItem = event.target.closest('.ai-question-item');
        
        // If clicking on an element that is part of edit controls, do nothing here
        if (event.target.closest('.q-edit-controls')) return;

        // Remove any existing edit controls if a new question item is clicked (or outside)
        if (activeQuestionEditControls && (!clickedQuestionItem || activeQuestionEditControls.parentElement !== clickedQuestionItem)) {
            disableQuestionEditMode(activeQuestionEditControls.parentElement, 
                                   parseInt(activeQuestionEditControls.parentElement.dataset.sessionQuestionIndex, 10), 
                                   chatMessagesArea, sessionParams, currentSessionQuestions, false); // false means don't save, just cancel
        }
        // Remove existing popups if clicking anywhere else or on a new item
        const existingPopup = document.getElementById('ai-question-editor-popup');
        if (existingPopup) existingPopup.remove();


        if (clickedQuestionItem) {
            // Don't show popup if the item is already in edit mode
            if (clickedQuestionItem.classList.contains('editing-question')) return;

            const questionIndex = parseInt(clickedQuestionItem.dataset.sessionQuestionIndex, 10);
            if (!isNaN(questionIndex) && currentSessionQuestions[questionIndex]) {
                showEditDeletePopup(clickedQuestionItem, questionIndex, chatMessagesArea, sessionParams, currentSessionQuestions);
            }
        }
    });
}

function renderAiQuestionToChat(questionData, index) {
    const questionContainer = document.createElement('div');
    questionContainer.className = 'message ai-message ai-question-item';
    questionContainer.dataset.questionId = questionData.id; 
    questionContainer.dataset.sessionQuestionIndex = index; 

    const metaDiv = document.createElement('div'); 
    metaDiv.className = 'question-meta-ai';
    metaDiv.textContent = questionData.parsedMeta || "Meta not available"; // Handle null/undefined
    
    const bodyDiv = document.createElement('div'); 
    bodyDiv.className = 'question-text-ai';
    bodyDiv.textContent = questionData.parsedBody || "Body not available"; // Handle null/undefined

    questionContainer.appendChild(metaDiv); 
    questionContainer.appendChild(bodyDiv);
    return questionContainer;
}

function displayAllSessionQuestions(messagesArea, questionsArray, sessionParams) {
    const existingQuestionItems = messagesArea.querySelectorAll('.ai-question-item');
    existingQuestionItems.forEach(item => item.remove());
    
    questionsArray.forEach((qData, index) => {
        const questionElement = renderAiQuestionToChat(qData, index);
        messagesArea.appendChild(questionElement);
    });

    if (questionsArray.length > 0 && window.MathJax) {
        MathJax.typesetPromise([messagesArea]).catch(err => console.error("MathJax typesetting error on refresh:", err));
    }
    // messagesArea.scrollTop = messagesArea.scrollHeight; // Avoid aggressive scrolling if user is interacting
}

function parseAndDisplayAiQuestions(aiResponseText, messagesArea, sessionParams, sessionQuestionsArray) {
    const questionsTextBlocks = aiResponseText.split(/\n(?=Q\s*\d+:)/g).map(q => q.trim()).filter(q => q);
    let newQuestionsParsed = false;

    if (questionsTextBlocks.length === 0 && aiResponseText.trim() !== "") {
        appendChatMessage(aiResponseText, 'ai-raw', messagesArea);
    }

    questionsTextBlocks.forEach((qText) => { 
        const questionId = `q-session-${Date.now()}-${sessionQuestionsArray.length}`; 
        const questionRegex = /^(Q\s*(\d+):\s*([^,/]+?)(?:\/Level\s*(\d+))?,\s*(\d+)\s*Marks)\s*([\s\S]*)/im;
        const match = qText.match(questionRegex);
        const questionData = { 
            id: questionId, fullText: qText, class: sessionParams.class, subject: sessionParams.subject, chapter: sessionParams.chapter,
            parsedMeta: null, parsedBody: null, difficulty: null, level: null, marks: null, questionNumberInAIResponse: null,
            originalParsedMeta: null, originalParsedBody: null // For cancel edit
        };
        if (match) { 
            questionData.parsedMeta = match[1].trim(); questionData.questionNumberInAIResponse = match[2]?.trim();
            questionData.difficulty = match[3]?.trim(); questionData.level = match[4] ? parseInt(match[4], 10) : null;
            questionData.marks = match[5] ? parseInt(match[5].trim(), 10) : null; questionData.parsedBody = match[6]?.trim() || "";
        } else { questionData.parsedBody = qText; questionData.parsedMeta = ""; /* Ensure parsedMeta is at least an empty string */ }
        questionData.originalParsedMeta = questionData.parsedMeta; // Store original
        questionData.originalParsedBody = questionData.parsedBody; // Store original
        sessionQuestionsArray.push(questionData);
        newQuestionsParsed = true;
    });

    if (newQuestionsParsed) {
        displayAllSessionQuestions(messagesArea, sessionQuestionsArray, sessionParams);
    }
}

function showEditDeletePopup(targetElement, questionIndex, messagesArea, sessionParams, questionsArrayRef) {
    const existingPopup = document.getElementById('ai-question-editor-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.id = 'ai-question-editor-popup';
    popup.className = 'ai-question-popup'; 

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.className = 'popup-edit-btn';
    editButton.onclick = (e) => {
        e.stopPropagation(); // Prevent chatMessagesArea click listener from re-triggering
        enableQuestionEditMode(targetElement, questionIndex, messagesArea, sessionParams, questionsArrayRef);
        popup.remove(); 
    };

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.className = 'popup-delete-btn';
    deleteButton.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete this question?\n"${questionsArrayRef[questionIndex].parsedBody.substring(0, 70)}..."`)) {
            questionsArrayRef.splice(questionIndex, 1); 
            displayAllSessionQuestions(messagesArea, questionsArrayRef, sessionParams); 
        }
        popup.remove();
    };

    popup.appendChild(editButton);
    popup.appendChild(deleteButton);
    document.body.appendChild(popup); 

    const rect = targetElement.getBoundingClientRect();
    popup.style.position = 'absolute';
    
    // Attempt to position to the right, then left, then below if no space
    let popupLeft = window.scrollX + rect.left + rect.width + 5;
    let popupTop = window.scrollY + rect.top + (rect.height / 2) - (popup.offsetHeight / 2);

    if (popupLeft + popup.offsetWidth > window.innerWidth) { // If off-screen right
        popupLeft = window.scrollX + rect.left - popup.offsetWidth - 5; // Try left
    }
    if (popupLeft < 0) { // If still off-screen left (e.g. narrow view or wide popup)
        popupLeft = window.scrollX + rect.left + (rect.width / 2) - (popup.offsetWidth / 2); // Center below/above
        popupTop = window.scrollY + rect.bottom + 5; // Position below
        if (popupTop + popup.offsetHeight > window.innerHeight + window.scrollY) { // If off-screen bottom
            popupTop = window.scrollY + rect.top - popup.offsetHeight - 5; // Position above
        }
    }
     // Ensure top is within bounds
    if (popupTop < window.scrollY) popupTop = window.scrollY;
    if (popupTop + popup.offsetHeight > window.innerHeight + window.scrollY) {
        popupTop = window.innerHeight + window.scrollY - popup.offsetHeight;
    }

    popup.style.top = `${popupTop}px`;
    popup.style.left = `${popupLeft}px`;
}

function enableQuestionEditMode(questionElement, questionIndex, messagesArea, sessionParams, questionsArrayRef) {
    if (activeQuestionEditControls) { // If another edit is active, cancel it
        const prevQuestionEl = activeQuestionEditControls.parentElement;
        const prevIndex = parseInt(prevQuestionEl.dataset.sessionQuestionIndex, 10);
        disableQuestionEditMode(prevQuestionEl, prevIndex, messagesArea, sessionParams, questionsArrayRef, false); // false = don't save
    }
    
    questionElement.classList.add('editing-question');
    const questionData = questionsArrayRef[questionIndex];
    const metaDiv = questionElement.querySelector('.question-meta-ai');
    const bodyDiv = questionElement.querySelector('.question-text-ai');

    if (!metaDiv || !bodyDiv) return;

    // Store original for cancel
    const originalMeta = questionData.parsedMeta;
    const originalBody = questionData.parsedBody;

    metaDiv.contentEditable = true;
    bodyDiv.contentEditable = true;
    metaDiv.style.border = '1px dashed #007bff'; 
    bodyDiv.style.border = '1px dashed #007bff';
    metaDiv.focus();

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'q-edit-controls';
    
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
        disableQuestionEditMode(questionElement, questionIndex, messagesArea, sessionParams, questionsArrayRef, false); // false = cancel
    };

    controlsDiv.appendChild(saveEditBtn);
    controlsDiv.appendChild(cancelEditBtn);
    questionElement.appendChild(controlsDiv);
    activeQuestionEditControls = controlsDiv; // Store reference
}

function disableQuestionEditMode(questionElement, questionIndex, messagesArea, sessionParams, questionsArrayRef, saveChanges) {
    if (!questionElement || !questionElement.classList.contains('editing-question')) return;

    const questionData = questionsArrayRef[questionIndex];
    const metaDiv = questionElement.querySelector('.question-meta-ai');
    const bodyDiv = questionElement.querySelector('.question-text-ai');
    
    if (!metaDiv || !bodyDiv) return;

    if (saveChanges) {
        const newMetaText = metaDiv.innerText.trim();
        const newBodyText = bodyDiv.innerText.trim();

        questionData.parsedBody = newBodyText;
        
        const metaRegex = /^(Q\s*(\d+):\s*([^,/]+?)(?:\/Level\s*(\d+))?,\s*(\d+)\s*Marks)/im;
        const metaMatch = newMetaText.match(metaRegex);
        if (metaMatch) {
            questionData.parsedMeta = metaMatch[1].trim();
            questionData.questionNumberInAIResponse = metaMatch[2]?.trim();
            questionData.difficulty = metaMatch[3]?.trim();
            questionData.level = metaMatch[4] ? parseInt(metaMatch[4], 10) : null;
            questionData.marks = metaMatch[5] ? parseInt(metaMatch[5].trim(), 10) : null;
        } else {
            questionData.parsedMeta = newMetaText; // Store raw edited meta
            questionData.difficulty = null; questionData.level = null; questionData.marks = null;
            console.warn("Meta line may be malformed after edit, storing as typed:", newMetaText);
        }
        questionData.fullText = (questionData.parsedMeta || "") + "\n" + (questionData.parsedBody || "");
        // Update original values as well, so cancel after a save doesn't revert to pre-save state
        questionData.originalParsedMeta = questionData.parsedMeta;
        questionData.originalParsedBody = questionData.parsedBody;

    } else { // Cancelled, revert to original stored in questionData for this edit session
        metaDiv.textContent = questionData.originalParsedMeta;
        bodyDiv.textContent = questionData.originalParsedBody;
    }

    metaDiv.contentEditable = false;
    bodyDiv.contentEditable = false;
    metaDiv.style.border = 'none';
    bodyDiv.style.border = 'none';
    questionElement.classList.remove('editing-question');
    
    const controlsDiv = questionElement.querySelector('.q-edit-controls');
    if (controlsDiv) controlsDiv.remove();
    activeQuestionEditControls = null;

    // Re-render this specific question to apply changes and MathJax
    // For simplicity, just re-render all, or find a way to replace just this one element
    displayAllSessionQuestions(messagesArea, questionsArrayRef, sessionParams); 
}


function appendChatMessage(message, type, messagesArea) { 
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type + '-message');
    if (type === 'user' || type === 'ai-raw') { const pre = document.createElement('pre'); pre.textContent = message; messageDiv.appendChild(pre); }
    else { messageDiv.textContent = message; }
    if (type === 'ai-raw') { messageDiv.classList.remove('ai-raw-message'); messageDiv.classList.add('ai-message');}
    messagesArea.appendChild(messageDiv); messagesArea.scrollTop = messagesArea.scrollHeight;
    if (type.includes('blink')) { messageDiv.classList.add('blinking-text'); }
}


// ====== QUESTION BANK LOGIC (MODIFIED for Edit Functionality) ======
let qbQuestionsCache = []; 
let activeQbEditControls = null; 

async function loadQuestionBank() {
    const qbOutputDiv = document.getElementById("qb-output");
    if (!qbOutputDiv) { console.error("Question Bank output div not found"); return; }
    
    qbOutputDiv.innerHTML = "Loading questions...";

    if (!currentUserProfile || !auth.currentUser) {
        showSection('login-section'); 
        return;
    }

    try {
        const query = db.collection("questions")
                        .where("createdBy", "==", currentUserProfile.uid)
                        .orderBy("timestamp", "desc");

        const snapshot = await query.get();
        qbQuestionsCache = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, 
                ...data,
                // Store original values for potential edit cancellation
                originalParsedMetaToEdit: data.metaLine || (data.difficulty && data.marks ? `Q: ${data.difficulty}${data.level ? '/Level '+data.level : ''}, ${data.marks} Marks` : "Details"),
                originalParsedBodyToEdit: data.body || data.text || ""
            };
        });
        
        setupQuestionBankFilters(); 
        filterAndDisplayQbQuestions(); 

        qbOutputDiv.removeEventListener('click', handleQbItemClick); 
        qbOutputDiv.addEventListener('click', handleQbItemClick);

    } catch (error) {
        console.error("Error loading question bank:", error);
        qbOutputDiv.innerHTML = "Error loading questions.";
    }
}

function handleQbItemClick(event) {
    const clickedQuestionItem = event.target.closest('.qb-item');
    
    if (event.target.closest('.qb-edit-controls')) return; 

    if (activeQbEditControls && (!clickedQuestionItem || activeQbEditControls.parentElement !== clickedQuestionItem)) {
        const prevQuestionEl = activeQbEditControls.parentElement;
        const questionDbId = prevQuestionEl.dataset.questionDbId;
        const cacheIndex = qbQuestionsCache.findIndex(q => q.id === questionDbId);
        if (cacheIndex !== -1) {
            disableQbQuestionEditMode(prevQuestionEl, questionDbId, cacheIndex, false); // false = don't save, just cancel UI
        }
    }

    const existingPopup = document.getElementById('qb-item-action-popup');
    if (existingPopup) existingPopup.remove();

    if (clickedQuestionItem) {
        if (clickedQuestionItem.classList.contains('editing-question-qb')) return;

        const questionDbId = clickedQuestionItem.dataset.questionDbId;
        const questionCacheIndex = qbQuestionsCache.findIndex(q => q.id === questionDbId);

        if (questionDbId && questionCacheIndex !== -1) {
            showQbItemActionPopup(clickedQuestionItem, questionDbId, questionCacheIndex);
        }
    }
}

function setupQuestionBankFilters() { /* ... as before ... */ }
function populateCustomDropdownOptions(dropdownId, optionsArray, defaultOptionText) { /* ... as before ... */ }
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
        if (chapterVal && q.chapter !== chapterVal) return false;
        if (selectedMarks.length > 0) {
            const qMarksStr = q.marks ? q.marks.toString() : "";
            if (!selectedMarks.includes(qMarksStr)) {
                const text = q.text || q.body || ""; 
                const textMatch = typeof text === 'string' ? text.match(/\((\s*[^,]+,)?\s*(\d+)\s*Marks?\)/i) : null;
                const textMarksVal = textMatch ? textMatch[2] : null;
                if (!textMarksVal || !selectedMarks.includes(textMarksVal)) return false;
            }
        }
        return true;
    });
    renderQbQuestions(filtered, qbOutputDiv); 
}

function renderQbQuestions(listToRender, outputDiv) { 
    outputDiv.innerHTML = "";
    if (listToRender.length === 0) {
        outputDiv.innerHTML = "<p>No questions found matching your criteria.</p>";
        return;
    }
    listToRender.forEach((qData) => { 
        const card = document.createElement("div");
        card.className = "question-card qb-item"; 
        card.dataset.questionDbId = qData.id; 
        const cacheIndex = qbQuestionsCache.findIndex(q => q.id === qData.id);
        card.dataset.qbQuestionCacheIndex = cacheIndex; // For direct access to cache item

        const qTextContainer = document.createElement("div");
        qTextContainer.className = "qb-item-text-container"; 

        const metaText = qData.metaLine || (qData.difficulty && qData.marks ? `Q: ${qData.difficulty}${qData.level ? '/Level '+qData.level : ''}, ${qData.marks} Marks` : "");
        const bodyText = qData.body || qData.text || "Question text not available.";

        const metaDiv = document.createElement('div');
        metaDiv.className = 'question-meta-ai'; 
        metaDiv.textContent = metaText;

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'question-text-ai'; 
        bodyDiv.textContent = bodyText; 
        
        qTextContainer.appendChild(metaDiv);
        qTextContainer.appendChild(bodyDiv);

        let otherMetaInfoHtml = '<small class="qb-item-details">';
        let hasOtherMeta = false;
        if(qData.class) { otherMetaInfoHtml += `<strong>Cl:</strong> ${qData.class} `; hasOtherMeta = true; }
        if(qData.subject) { otherMetaInfoHtml += `<strong>Sub:</strong> ${qData.subject} `; hasOtherMeta = true; }
        if(qData.chapter) { otherMetaInfoHtml += `<strong>Ch:</strong> ${qData.chapter} `; hasOtherMeta = true; }
        // Display marks and difficulty from structured fields if available, fallback to metaText already covering it
        if (!qData.metaLine && qData.marks) { otherMetaInfoHtml += `<strong>Marks:</strong> ${qData.marks} `; hasOtherMeta = true; }
        if (!qData.metaLine && qData.difficulty) { otherMetaInfoHtml += `<strong>Diff:</strong> ${qData.difficulty} ${qData.level ? '/L'+qData.level : ''} `; hasOtherMeta = true; }
        otherMetaInfoHtml += '</small>';
        if(hasOtherMeta) qTextContainer.innerHTML += otherMetaInfoHtml;


        card.appendChild(qTextContainer);
        outputDiv.appendChild(card);
    });

    if (window.MathJax) {
        MathJax.typesetPromise([outputDiv]).catch(err => console.error("MathJax error in QB:", err));
    }
}

function showQbItemActionPopup(targetElement, questionDbId, questionCacheIndex) {
    const existingPopup = document.getElementById('qb-item-action-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.id = 'qb-item-action-popup';
    popup.className = 'ai-question-popup'; // Reuse AI chat popup style

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.className = 'popup-edit-btn';
    editButton.onclick = (e) => {
        e.stopPropagation();
        enableQbQuestionEditMode(targetElement, questionDbId, questionCacheIndex);
        popup.remove();
    };
    popup.appendChild(editButton);
    document.body.appendChild(popup);

    // Positioning logic (can be further refined for mobile edge cases)
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
    if (activeQbEditControls) { 
        const prevQuestionEl = activeQbEditControls.parentElement;
        const prevDbId = prevQuestionEl.dataset.questionDbId;
        const prevCacheIdx = qbQuestionsCache.findIndex(q => q.id === prevDbId);
        if (prevCacheIdx !== -1) {
            disableQbQuestionEditMode(prevQuestionEl, prevDbId, prevCacheIdx, false); // Cancel previous edit
        }
    }
    
    questionElement.classList.add('editing-question-qb'); 
    const questionData = qbQuestionsCache[questionCacheIndex];

    const textContainer = questionElement.querySelector('.qb-item-text-container');
    const metaDiv = textContainer.querySelector('.question-meta-ai');
    const bodyDiv = textContainer.querySelector('.question-text-ai');

    if (!metaDiv || !bodyDiv) { console.error("Meta or Body div not found for QB editing."); return; }

    // Use the stored original values for this edit session from the cache object
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
    saveEditBtn.className = 'btn-small btn-save-edit';
    saveEditBtn.onclick = async (e) => {
        e.stopPropagation();
        await disableQbQuestionEditMode(questionElement, questionDbId, questionCacheIndex, true); // true = save
    };

    const cancelEditBtn = document.createElement('button');
    cancelEditBtn.textContent = 'Cancel';
    cancelEditBtn.className = 'btn-small btn-cancel-edit';
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
            body: newBodyText,
            metaLine: newMetaText, // Store the edited meta line
            // Re-parse difficulty, level, marks from newMetaText
            difficulty: null, level: null, marks: null 
        };

        const metaRegex = /^(Q\s*(\d+):\s*([^,/]+?)(?:\/Level\s*(\d+))?,\s*(\d+)\s*Marks)/im;
        const metaMatch = newMetaText.match(metaRegex);
        if (metaMatch) {
            updateData.difficulty = metaMatch[3]?.trim();
            updateData.level = metaMatch[4] ? parseInt(metaMatch[4], 10) : null;
            updateData.marks = metaMatch[5] ? parseInt(metaMatch[5].trim(), 10) : null;
        } else {
            console.warn("Meta line may be malformed after QB edit:", newMetaText);
        }
        // Reconstruct full 'text' field if your Firestore structure relies on it,
        // or if 'text' was the primary source before edit.
        // For consistency, let's assume 'text' stores the full Q block.
        updateData.text = newMetaText + "\n" + newBodyText;


        try {
            await db.collection("questions").doc(questionDbId).update(updateData);
            // Update cache
            qbQuestionsCache[questionCacheIndex] = { ...questionDataFromCache, ...updateData, 
                                                    originalParsedMetaToEdit: updateData.metaLine, 
                                                    originalParsedBodyToEdit: updateData.body }; // Update original for next edit
            alert("Question updated successfully!");
        } catch (error) {
            console.error("Error updating question in Firestore:", error);
            alert("Failed to update question. Please try again.");
            // Revert UI to original if save failed (or simply don't remove edit mode)
            metaDiv.textContent = questionDataFromCache.originalParsedMetaToEdit;
            bodyDiv.textContent = questionDataFromCache.originalParsedBodyToEdit;
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

    filterAndDisplayQbQuestions(); // Refresh the QB display from cache
}


// ====== CUSTOM DROPDOWN LOGIC ======
// ... (optionsContainerListener, setupCustomDropdown, closeAllDropdowns as before,
//      ensure optionsContainerListener is robust for QB dynamic chapter updates) ...
function optionsContainerListener(optionsContainer, selectedDisplay, hiddenInput, dropdownElement, changeCallback) {
    if (!optionsContainer) return;
    // Clear previous options listeners to prevent multiple triggers if re-calling
    const newOptionsContainer = optionsContainer.cloneNode(true);
    optionsContainer.parentNode.replaceChild(newOptionsContainer, optionsContainer);
    
    newOptionsContainer.querySelectorAll("div[data-value]").forEach(opt => {
        opt.onclick = function (event) {
            event.stopPropagation();
            selectedDisplay.textContent = opt.textContent;
            hiddenInput.value = opt.dataset.value;
            dropdownElement.classList.remove("open");
            newOptionsContainer.style.display = "none";
            if (changeCallback) {
                changeCallback(opt.dataset.value); 
            }
            hiddenInput.dispatchEvent(new Event('change', { bubbles: true })); 
        };
    });
}

function setupCustomDropdown(dropdownId, hiddenInputId, changeCallback = null) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) { console.warn(`Dropdown ${dropdownId} not found.`); return; }
    const selectedDisplay = dropdown.querySelector(".selected-option");
    const optionsContainer = dropdown.querySelector(".dropdown-options");
    const hiddenInput = document.getElementById(hiddenInputId);
    if (!selectedDisplay || !optionsContainer || !hiddenInput) { 
        console.warn(`Parts missing for dropdown ${dropdownId}.`); return; 
    }

    selectedDisplay.onclick = function (event) {
        event.stopPropagation();
        closeAllDropdowns(dropdownId); 
        const isOpen = dropdown.classList.toggle("open");
        optionsContainer.style.display = isOpen ? "block" : "none";
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
document.addEventListener("click", function (e) { 
    if (!e.target.closest('.custom-dropdown')) { 
        closeAllDropdowns();
    }
    if (!e.target.closest('.ai-question-popup') && !e.target.closest('.ai-question-item') && !e.target.closest('.qb-item')) {
        const existingAiPopup = document.getElementById('ai-question-editor-popup');
        if (existingAiPopup) existingAiPopup.remove();
        const existingQbPopup = document.getElementById('qb-item-action-popup');
        if (existingQbPopup) existingQbPopup.remove();
    }
});


// ====== EXAM BUILDER SECTION (NEW UI Function) ======
function loadExamBuilderForm() {
    const examBuilderContainer = document.getElementById('exam-builder-container');
    if (!examBuilderContainer) {
        console.error("Exam Builder container not found!");
        return;
    }

    // Configurable lists (hardcoded for now, "editable config list" is a future enhancement)
    const examNameOptions = ["Slip Test", "Fortnight Exam", "Formative Assessment", "Summative Assessment", "Unit Test", "Custom"];
    const examTypeOptions = ["MCQs", "Descriptive", "Both"];
    const mcqLevelOptions = ["Level 1 (Easy)", "Level 2 (Medium)", "Level 3 (Difficult)", "Mixed"];
    const maxMarksOptions = [10, 15, 20, 25, 30, 40, 50, 75, 80, 100];
    const difficultyOptions = ["Easy", "Medium", "Difficult", "Mixed By Percentage"];


    let classDropdownHTML = aiGeneratorConfig.classes.map(c => `<div data-value="${c}">${c}</div>`).join('');
    let subjectDropdownHTML = aiGeneratorConfig.subjectsBase.map(s => `<div data-value="${s}">${s}</div>`).join(''); // Initially all subjects
    let examNameDropdownHTML = examNameOptions.map(e => `<div data-value="${e}">${e}</div>`).join('');
    let examTypeDropdownHTML = examTypeOptions.map(e => `<div data-value="${e}">${e}</div>`).join('');
    let mcqLevelDropdownHTML = mcqLevelOptions.map(lvl => `<div data-value="${lvl}">${lvl}</div>`).join('');
    let maxMarksDropdownHTML = maxMarksOptions.map(m => `<div data-value="${m}">${m}</div>`).join('');
    let difficultyDropdownHTML = difficultyOptions.map(d => `<div data-value="${d}">${d}</div>`).join('');

    examBuilderContainer.innerHTML = `
        <h2>Create New Exam Paper</h2>
        <form id="exam-builder-form">
            <div class="form-grid">
                {/* Row 1 */}
                <div class="form-group">
                    <label for="eb-class">Class:</label>
                    <div id="eb-class-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-class" name="ebClass">
                        <div class="selected-option">Select Class</div>
                        <div class="dropdown-options">${classDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="eb-subject">Subject:</label>
                    <div id="eb-subject-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-subject" name="ebSubject">
                        <div class="selected-option">Select Subject</div>
                        <div class="dropdown-options">${subjectDropdownHTML}</div>
                    </div>
                </div>
                
                {/* Row 2 */}
                <div class="form-group form-group-span-2"> {/* Spans 2 columns */}
                    <label for="eb-chapters">Chapters (Ctrl/Cmd + Click to select multiple):</label>
                    <select id="eb-chapters" name="ebChapters" multiple class="qb-standard-select-multiple" style="min-height: 100px;">
                        {/* Options will be populated dynamically by JS */}
                        <option value="" disabled>Select Subject first</option>
                    </select>
                </div>

                {/* Row 3 */}
                <div class="form-group">
                    <label for="eb-exam-name">Exam Name:</label>
                    <div id="eb-exam-name-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-exam-name" name="ebExamName">
                        <div class="selected-option">Select Exam Name</div>
                        <div class="dropdown-options">${examNameDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group">
                    <label for="eb-exam-type">Exam Type:</label>
                    <div id="eb-exam-type-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-exam-type" name="ebExamType">
                        <div class="selected-option">Select Exam Type</div>
                        <div class="dropdown-options">${examTypeDropdownHTML}</div>
                    </div>
                </div>

                {/* Row 4 - Conditional MCQ Level */}
                <div class="form-group" id="eb-mcq-level-group" style="display: none;">
                    <label for="eb-mcq-level">MCQ Level:</label>
                    <div id="eb-mcq-level-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-mcq-level" name="ebMcqLevel">
                        <div class="selected-option">Select MCQ Level</div>
                        <div class="dropdown-options">${mcqLevelDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group">
                     <label for="eb-max-marks">Max Marks:</label>
                    <div id="eb-max-marks-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-max-marks" name="ebMaxMarks">
                        <div class="selected-option">Select Max Marks</div>
                        <div class="dropdown-options">${maxMarksDropdownHTML}</div>
                    </div>
                </div>
                
                {/* Row 5 - Difficulty */}
                 <div class="form-group">
                    <label for="eb-difficulty">Overall Difficulty:</label>
                    <div id="eb-difficulty-dropdown" class="custom-dropdown">
                        <input type="hidden" id="eb-difficulty" name="ebDifficulty">
                        <div class="selected-option">Select Difficulty</div>
                        <div class="dropdown-options">${difficultyDropdownHTML}</div>
                    </div>
                </div>
                <div class="form-group" id="eb-difficulty-percentages-group" style="display: none;">
                    <label>Difficulty Mix (%):</label>
                    <div class="difficulty-mix-inputs">
                        <div><label for="eb-diff-easy-perc">Easy:</label><input type="number" id="eb-diff-easy-perc" name="ebDiffEasyPerc" min="0" max="100" placeholder="%"></div>
                        <div><label for="eb-diff-medium-perc">Medium:</label><input type="number" id="eb-diff-medium-perc" name="ebDiffMediumPerc" min="0" max="100" placeholder="%"></div>
                        <div><label for="eb-diff-hard-perc">Difficult:</label><input type="number" id="eb-diff-hard-perc" name="ebDiffHardPerc" min="0" max="100" placeholder="%"></div>
                    </div>
                    <small>Percentages must total 100%.</small>
                </div>
                
                {/* Row 6 - Time & Date */}
                <div class="form-group">
                    <label for="eb-time">Time Allowed:</label>
                    <input type="text" id="eb-time" name="ebTime" placeholder="e.g., 2 hours, 90 minutes">
                </div>
                <div class="form-group">
                    <label for="eb-date">Date of Exam:</label>
                    <input type="date" id="eb-date" name="ebDate">
                </div>
                
                {/* Row 7 - Instructions */}
                <div class="form-group form-group-span-2">
                    <label for="eb-instructions">Instructions (Optional):</label>
                    <textarea id="eb-instructions" name="ebInstructions" rows="3" placeholder="Enter general instructions for the exam..."></textarea>
                </div>
            </div>

            <div id="eb-sections-container" class="sections-container">
                <h3>Sections</h3>
                {/* Sections will be added here by JS */}
                <button type="button" id="eb-add-section-btn" class="btn-small">
                    <i class="fas fa-plus"></i> Add Section
                </button>
                <div class="section-placeholder" style="display: none; border: 1px dashed #ccc; padding: 10px; margin-top:10px;">
                    {/* Placeholder for a newly added section's UI */}
                    <p>Section details (like name, question types, number of questions, marks per question) will go here.</p>
                </div>
            </div>

            <button type="submit" class="btn" style="margin-top: 20px;">Proceed to Select Questions</button>
        </form>
    `;

    // Initialize custom dropdowns for the Exam Builder form
    setupCustomDropdown('eb-class-dropdown', 'eb-class');
    setupCustomDropdown('eb-subject-dropdown', 'eb-subject');
    // Note: Chapters dropdown is a standard select multiple, no setupCustomDropdown needed here.
    setupCustomDropdown('eb-exam-name-dropdown', 'eb-exam-name');
    setupCustomDropdown('eb-exam-type-dropdown', 'eb-exam-type', (value) => { // Add callback for exam type
        const mcqLevelGroup = document.getElementById('eb-mcq-level-group');
        if (value === 'MCQs' || value === 'Both') {
            mcqLevelGroup.style.display = 'block';
        } else {
            mcqLevelGroup.style.display = 'none';
        }
    });
    setupCustomDropdown('eb-mcq-level-dropdown', 'eb-mcq-level');
    setupCustomDropdown('eb-max-marks-dropdown', 'eb-max-marks');
    setupCustomDropdown('eb-difficulty-dropdown', 'eb-difficulty', (value) => { // Add callback for difficulty
        const difficultyPercGroup = document.getElementById('eb-difficulty-percentages-group');
        if (value === 'Mixed By Percentage') {
            difficultyPercGroup.style.display = 'block'; // Or 'flex' if using flex for inner layout
        } else {
            difficultyPercGroup.style.display = 'none';
        }
    });

    // Placeholder for "Add Section" button functionality
    document.getElementById('eb-add-section-btn').onclick = function() {
        // This will be expanded later to add actual section input fields
        const placeholder = document.querySelector('.section-placeholder');
        if (placeholder) {
            const newSection = placeholder.cloneNode(true);
            newSection.style.display = 'block';
            document.getElementById('eb-sections-container').insertBefore(newSection, this);
            alert("Section added (placeholder). Drag-and-drop and detailed section inputs are future features.");
        }
    };
    
    // Placeholder for form submission
    document.getElementById('exam-builder-form').onsubmit = function(e) {
        e.preventDefault();
        // Collect form data - to be implemented
        const formData = new FormData(this);
        const data = {};
        for (let [key, value] of formData.entries()) {
            // Handle multi-select for chapters
            if (key === 'ebChapters') {
                if (!data[key]) data[key] = [];
                data[key].push(value);
            } else {
                data[key] = value;
            }
        }
        // Get values from hidden inputs of custom dropdowns not covered by FormData directly name attributes
        data['ebClass'] = document.getElementById('eb-class').value;
        data['ebSubject'] = document.getElementById('eb-subject').value;
        data['ebExamName'] = document.getElementById('eb-exam-name').value;
        data['ebExamType'] = document.getElementById('eb-exam-type').value;
        if (data['ebExamType'] === 'MCQs' || data['ebExamType'] === 'Both') {
            data['ebMcqLevel'] = document.getElementById('eb-mcq-level').value;
        }
        data['ebMaxMarks'] = document.getElementById('eb-max-marks').value;
        data['ebDifficulty'] = document.getElementById('eb-difficulty').value;


        console.log("Exam Builder Form Data:", data);
        alert("Form submission initiated. Next step is fetching and arranging questions (pending).");
        // Proceed to next step (fetching questions, preview, etc.) - future implementation
    };

    // Initial dynamic updates (e.g., populate subjects based on class if needed, or chapters based on subject)
    // This will be more fleshed out in the next step focusing on form logic.
    // For now, class and subject dropdowns are populated with all options.
    // Chapters dropdown will require logic to populate based on class/subject selection.
}


// ====== CUSTOM DROPDOWN LOGIC ======
// ... (optionsContainerListener, setupCustomDropdown, closeAllDropdowns as previously defined) ...
function optionsContainerListener(optionsContainer, selectedDisplay, hiddenInput, dropdownElement, changeCallback) {
    if (!optionsContainer) return;
    const newOptionsContainer = optionsContainer.cloneNode(true); 
    optionsContainer.parentNode.replaceChild(newOptionsContainer, optionsContainer);
    
    newOptionsContainer.querySelectorAll("div[data-value]").forEach(opt => {
        opt.onclick = function (event) {
            event.stopPropagation();
            selectedDisplay.textContent = opt.textContent;
            hiddenInput.value = opt.dataset.value;
            dropdownElement.classList.remove("open");
            newOptionsContainer.style.display = "none";
            if (changeCallback) {
                changeCallback(opt.dataset.value); 
            }
            hiddenInput.dispatchEvent(new Event('change', { bubbles: true })); 
        };
    });
}

function setupCustomDropdown(dropdownId, hiddenInputId, changeCallback = null) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) { console.warn(`Dropdown ${dropdownId} not found.`); return; }
    const selectedDisplay = dropdown.querySelector(".selected-option");
    const optionsContainer = dropdown.querySelector(".dropdown-options");
    const hiddenInput = document.getElementById(hiddenInputId); // This is the ID of the <input type="hidden">
    if (!selectedDisplay || !optionsContainer || !hiddenInput) { 
        console.warn(`Parts missing for dropdown ${dropdownId}.`); return; 
    }

    selectedDisplay.onclick = function (event) {
        event.stopPropagation();
        closeAllDropdowns(dropdownId); 
        const isOpen = dropdown.classList.toggle("open");
        optionsContainer.style.display = isOpen ? "block" : "none";
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
document.addEventListener("click", function (e) { 
    if (!e.target.closest('.custom-dropdown')) { 
        closeAllDropdowns();
    }
    if (!e.target.closest('.ai-question-popup') && !e.target.closest('.ai-question-item') && !e.target.closest('.qb-item')) {
        const existingAiPopup = document.getElementById('ai-question-editor-popup');
        if (existingAiPopup) existingAiPopup.remove();
        const existingQbPopup = document.getElementById('qb-item-action-popup');
        if (existingQbPopup) existingQbPopup.remove();
    }
});


// ====== BROWSER HISTORY HANDLING ======
window.addEventListener("popstate", function (event) {
  let sectionId = (event.state && event.state.section) ? event.state.section : (auth.currentUser ? "dashboard-section" : "login-section");
  showSection(sectionId, false); 
  if (!auth.currentUser && sectionId !== 'login-section') {
      sectionId = 'login-section'; showSection(sectionId, false);
  }
  if (sectionId === 'dashboard-section' && auth.currentUser) loadDashboard();
  else if (sectionId === 'qbank-section' && auth.currentUser) loadQuestionBank(); 
  else if (sectionId === 'ai-question-section' && auth.currentUser) loadAiQuestionGeneratorForm(); 
  else if (sectionId === 'exam-builder-section' && auth.currentUser) { 
    loadExamBuilderForm(); // Call new function here too
  }
});
document.addEventListener("DOMContentLoaded", () => { /* ... */ });
