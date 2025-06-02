// question-bank.js

// ====== Firebase Setup ======
const firebaseConfig = {
  apiKey: "AIzaSyAszVhWXUUOYLQ7VimKmPKf1yEu_CI9RCE",
  authDomain: "stpatricks-questionbank.firebaseapp.com",
  projectId: "stpatricks-questionbank",
  storageBucket: "stpatricks-questionbank.appspot.com",
  messagingSenderId: "917615322861",
  appId: "1:917615322861:web:c6c890aa2184dd395b8ee4"
};
if (typeof firebase === "undefined") alert("Firebase not loaded!");
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// DOM references
const qbOutput = document.getElementById("qb-output");
const classFilter = document.getElementById("class-filter");
const subjectFilter = document.getElementById("subject-filter");
const chapterFilter = document.getElementById("chapter-filter");
const difficultyFilter = document.getElementById("difficulty-filter");
const marksFilter = document.getElementById("marks-filter");

// State
let allQuestions = [];
let filteredQuestions = [];
let filterOptions = {
  class: "",
  subject: "",
  chapter: "",
  difficulty: "",
  marks: ""
};

// Utility: Parse info from text if fields not present
function extractInfo(q) {
  // If explicit fields exist, use them
  if (q.class && q.subject && q.chapter && q.difficulty && q.marks) return q;
  // Otherwise, parse from text: "Question 1: (Easy, 2 Marks)\n..."
  let info = { ...q };
  let m = q.text.match(/\((Easy|Medium|Difficult),\s*(\d+)\s*Marks?\)/i);
  if (m) {
    info.difficulty = m[1];
    info.marks = m[2];
  }
  // Try to get class, subject, chapter if present
  if (q.class) info.class = q.class;
  if (q.subject) info.subject = q.subject;
  if (q.chapter) info.chapter = q.chapter;
  return info;
}

// Populate filter dropdowns
function populateFilters(questions) {
  function uniqueSorted(arr) {
    return [...new Set(arr)].sort((a, b) => (isNaN(a) ? a.localeCompare(b) : a - b));
  }
  // Collect all values for dropdowns
  const classes = uniqueSorted(questions.map(q => q.class).filter(Boolean));
  const subjects = uniqueSorted(questions.map(q => q.subject).filter(Boolean));
  const chapters = uniqueSorted(questions.map(q => q.chapter).filter(Boolean));
  const marks = uniqueSorted(questions.map(q => q.marks).filter(Boolean));

  // Helper to populate select options
  function setOptions(select, arr, label) {
    select.innerHTML = `<option value="">${label}</option>` +
      arr.map(v => `<option value="${v}">${v}</option>`).join('');
  }
  setOptions(classFilter, classes, "Class");
  setOptions(subjectFilter, subjects, "Subject");
  setOptions(chapterFilter, chapters, "Chapter");
  setOptions(marksFilter, marks, "Marks");
}

// Filter questions by selected options
function applyFilters() {
  filteredQuestions = allQuestions.filter(q => {
    if (filterOptions.class && q.class !== filterOptions.class) return false;
    if (filterOptions.subject && q.subject !== filterOptions.subject) return false;
    if (filterOptions.chapter && q.chapter !== filterOptions.chapter) return false;
    if (filterOptions.difficulty && q.difficulty !== filterOptions.difficulty) return false;
    if (filterOptions.marks && String(q.marks) !== String(filterOptions.marks)) return false;
    return true;
  });
  renderQuestions();
}

// Render questions as cards
function renderQuestions() {
  qbOutput.innerHTML = "";
  if (filteredQuestions.length === 0) {
    qbOutput.innerHTML = `<div style="text-align:center;color:#b92736;margin-top:30px;">No questions found for selected filters.</div>`;
    return;
  }
  filteredQuestions.forEach((q, idx) => {
    const card = document.createElement("div");
    card.className = "question-card";
    // Show meta if available
    card.innerHTML = `
      <div class="question-text">
        <span class="q-meta">
          ${q.class || ""} ${q.subject ? " | " + q.subject : ""} ${q.chapter ? " | " + q.chapter : ""}<br>
          ${q.difficulty ? q.difficulty : ""}${q.marks ? " | " + q.marks + " Marks" : ""}
        </span><br>
        <span class="q-body">${q.text.replace(/^Question \d+:(.*?)\n?/,'')}</span>
      </div>
      <div class="btn-group">
        <button class="btn-small copy-btn">Copy</button>
        <button class="btn-small delete-btn">Delete</button>
      </div>
    `;
    // Copy button
    card.querySelector('.copy-btn').onclick = () => {
      navigator.clipboard.writeText(q.text);
      alert("Question copied!");
    };
    // Delete button
    card.querySelector('.delete-btn').onclick = async () => {
      if (!confirm("Delete this question?")) return;
      try {
        await db.collection("questions").doc(q.id).delete();
        allQuestions = allQuestions.filter(qq => qq.id !== q.id);
        applyFilters();
      } catch (e) {
        alert("Failed to delete: " + e.message);
      }
    };
    qbOutput.appendChild(card);
  });
}

// Update filterOptions and re-filter on change
[classFilter, subjectFilter, chapterFilter, difficultyFilter, marksFilter].forEach((sel, idx) => {
  sel.onchange = function () {
    filterOptions = {
      ...filterOptions,
      class: classFilter.value,
      subject: subjectFilter.value,
      chapter: chapterFilter.value,
      difficulty: difficultyFilter.value,
      marks: marksFilter.value
    };
    applyFilters();
  };
});

// ==== MAIN ====
// Get user and fetch questions uploaded by this user only
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  // Fetch questions
  const qs = await db.collection("questions")
    .where("createdBy", "==", user.uid)
    .orderBy("timestamp", "desc")
    .get();

  allQuestions = qs.docs.map(doc => {
    let data = doc.data();
    data.id = doc.id;
    return extractInfo(data);
  });

  // Populate dropdowns & render
  populateFilters(allQuestions);
  filteredQuestions = allQuestions;
  renderQuestions();
});
