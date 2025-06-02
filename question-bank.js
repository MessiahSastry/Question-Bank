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

// DOM References
const classFilter = document.getElementById("class-filter");
const subjectFilter = document.getElementById("subject-filter");
const chapterFilter = document.getElementById("chapter-filter");
const difficultyFilter = document.getElementById("difficulty-filter");
const marksFilter = document.getElementById("marks-filter");
const outputDiv = document.getElementById("qb-output");

let questions = [];
let filteredQuestions = [];

// Fetch questions for logged-in user and populate filters
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  let snapshot = await db.collection("questions")
    .where("createdBy", "==", user.uid)
    .orderBy("timestamp", "desc")
    .get();

  questions = [];
  snapshot.forEach(doc => {
    let q = doc.data();
    q.id = doc.id;
    questions.push(q);
  });

  // Optionally, extract unique classes/subjects/chapters from data for dropdowns
  setFilterOptions();

  filteredQuestions = [...questions];
  renderQuestions(filteredQuestions);
});

// Set filter options if you want dynamic dropdowns (optional, can be customized)
function setFilterOptions() {
  let classes = new Set(), subjects = new Set(), chapters = new Set();
  questions.forEach(q => {
    if (q.class) classes.add(q.class);
    if (q.subject) subjects.add(q.subject);
    if (q.chapter) chapters.add(q.chapter);
  });

  // Helper to add options
  function setOptions(select, items, label) {
    select.innerHTML = `<option value="">${label}</option>`;
    Array.from(items).sort().forEach(val => {
      select.innerHTML += `<option value="${val}">${val}</option>`;
    });
  }
  setOptions(classFilter, classes, "Class");
  setOptions(subjectFilter, subjects, "Subject");
  setOptions(chapterFilter, chapters, "Chapter");
}

// Filtering logic
function filterQuestions() {
  let classVal = classFilter.value.trim();
  let subjectVal = subjectFilter.value.trim();
  let chapterVal = chapterFilter.value.trim();
  let diffVal = difficultyFilter.value.trim();
  let marksVal = marksFilter.value.trim();

  filteredQuestions = questions.filter(q => {
    // Try to extract difficulty and marks from text
    let diff = "", marks = "";
    let match = q.text.match(/\(([^,]+),\s*([\d]+)\s*Mark/i);
    if (match) {
      diff = match[1].trim();
      marks = match[2].trim();
    }
    let matches = true;
    if (classVal && (!q.class || q.class != classVal)) matches = false;
    if (subjectVal && (!q.subject || q.subject != subjectVal)) matches = false;
    if (chapterVal && (!q.chapter || q.chapter != chapterVal)) matches = false;
    if (diffVal && (!diff || diff.toLowerCase() !== diffVal.toLowerCase())) matches = false;
    if (marksVal && (!marks || marks !== marksVal)) matches = false;
    return matches;
  });

  renderQuestions(filteredQuestions);
}

// Render questions in the format: Q1. <question> (Difficulty, Marks)
function renderQuestions(list) {
  outputDiv.innerHTML = "";
  list.forEach((q, idx) => {
    // Extract in format "Question X: (Difficulty, Y Marks) actual question"
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

// Hook up filters
[classFilter, subjectFilter, chapterFilter, difficultyFilter, marksFilter].forEach(sel => {
  sel.addEventListener("change", filterQuestions);
});
