const admin = require('firebase-admin');
const serviceAccount = require('/etc/secrets/stpatricks-questionbank-firebase-adminsdk-fbsvc-91c6c1a11b.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
const Tesseract = require('tesseract.js');
const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");
const multer = require("multer");
const pdfParse = require("pdf-parse");
require("dotenv").config();
const path = require("path");

const app = express();

// --- CONFIGURATION ---
const API_VERSION = "/api/v1";
const ALLOWED_ORIGINS = [
    'https://messiahsastry.github.io',
    'https://stpatricks-questionbank.firebaseapp.com',
    'http://127.0.0.1:5500'
];

// --- MIDDLEWARE ---
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- MULTER CONFIGURATION (FOR FILE UPLOADS) ---
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only images and PDFs are allowed."), false);
        }
    },
});

app.use(express.static(path.join(__dirname, "public")));

// --- OPENAI CLIENT ---
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ========== 1. AI Text-Based Question Generation ==========
app.post(`${API_VERSION}/generate`, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: "No prompt provided." });
        }
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 2000,
        });
        res.json({ result: response.choices[0].message.content });
    } catch (error) {
        console.error(`Error in /generate:`, error);
        res.status(500).json({ error: "Failed to generate response." });
    }
});

// ========== 4. SUMMARIZE EXAM PROMPT FOR CONFIRMATION ==========
app.post(`${API_VERSION}/summarize-prompt`, async (req, res) => {
    try {
        const { prompt, class: examClass, subject, examName, chapters } = req.body;
        // Compose a GPT-4o prompt for summarization/confirmation
        const chatPrompt = `A teacher is trying to create an exam paper. Here are their instructions (may be incomplete or unclear):

---
Prompt: "${prompt}"
Class: ${examClass || "Not specified"}
Subject: ${subject || "Not specified"}
Exam Name: ${examName || "Not specified"}
Chapters: ${(chapters && chapters.length) ? chapters.join(", ") : "Not specified"}
---

Your job:
1. Briefly restate what the teacher is asking for in clear, simple, friendly language, even if their instructions are incomplete.
2. If anything is missing or unclear, make a best guess.
3. Only respond with 2-3 clear sentences. Do NOT repeat the prompt, summarize what you understood.

Example output:
"You are about to generate a Science exam for Class 8 based mostly on chapters 1 and 2, with an emphasis on MCQs. Total marks: 50."
        `.trim();
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: chatPrompt }],
            max_tokens: 200,
        });
        res.json({ summary: response.choices[0].message.content.trim() });
    } catch (error) {
        console.error(`Error in /summarize-prompt:`, error);
        res.status(500).json({ error: "Failed to summarize prompt." });
    }
});

// ========== 2. AI File-Based Question Extraction ==========
app.post(`${API_VERSION}/extract-from-image`, upload.single("imageFile"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
    }
    try {
        const teacherPrompt = req.body.prompt || "Please transcribe all questions from the document.";
        let aiResponse;

        if (req.file.mimetype.startsWith("image/")) {
    // 1. Use Tesseract to extract text from the image
    const { data: { text: extractedText } } = await Tesseract.recognize(req.file.buffer, 'eng');

    // 2. Prepare the prompt for OpenAI using extracted text
    const masterPrompt = `
        You are an expert AI assistant for St. Patrick's School. You will be given text extracted from an image and a teacher's request.
        The teacher's specific request is: "${teacherPrompt}"
        ---
        **YOUR INSTRUCTIONS:**
        Analyze the following text based on the teacher's request and format every single question you find according to this strict structure:
        1.  **Meta-data Line:** Each question MUST begin on a new line with the pattern "Q<number>: <Difficulty>/Level <Lvl>, <Marks> Marks". You must estimate the difficulty, level, and marks.
        2.  **Question Line:** The text of the question must follow on the next line.
        3.  **MCQ Formatting:** If it is a multiple-choice question, the options (A, B, C, D) and the final answer ("Ans: ...") should follow.
        4.  **LaTeX:** All mathematical equations must be in proper LaTeX format.
        ---
        **Extracted Text from Image:**
        ${extractedText}
        ---
        Now, fulfill the teacher's request using the provided text and follow all formatting instructions. Provide ONLY the formatted questions as your response.
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: masterPrompt }],
        max_tokens: 3000,
    });

    aiResponse = response.choices[0].message.content;
}

        // --- B. ELSE IF THE FILE IS A PDF ---
        else if (req.file.mimetype === "application/pdf") {
            const data = await pdfParse(req.file.buffer);
            const extractedText = data.text;
            const masterPrompt = `
                You are an expert AI assistant for St. Patrick's School. You will be given text extracted from a PDF and a teacher's request.
                The teacher's specific request is: "${teacherPrompt}"
                ---
                **YOUR INSTRUCTIONS:**
                Analyze the following text based on the teacher's request and format every single question you find according to this strict structure:
                1.  **Meta-data Line:** Each question MUST begin on a new line with the pattern "Q<number>: <Difficulty>/Level <Lvl>, <Marks> Marks". You must estimate the difficulty, level, and marks.
                2.  **Question Line:** The text of the question must follow on the next line.
                3.  **MCQ Formatting:** If it is a multiple-choice question, the options (A, B, C, D) and the final answer ("Ans: ...") should follow.
                4.  **LaTeX:** All mathematical equations must be in proper LaTeX format.
                ---
                **Extracted Text from PDF:**
                ${extractedText}
                ---
                Now, fulfill the teacher's request using the provided text and follow all formatting instructions. Provide ONLY the formatted questions as your response.
            `;
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: masterPrompt }],
                max_tokens: 3000,
            });
            aiResponse = response.choices[0].message.content;
        }

        res.json({ result: aiResponse });

    } catch (error) {
        console.error(`Error in /extract-from-image:`, error);
        res.status(500).json({ error: "Failed to process the uploaded file." });
    }
});

// ========== HEALTH & ROOT ENDPOINTS ==========
app.get("/", (req, res) => {
    res.send("St. Patrick's Question Bank Backend is running!");
});

app.get(`${API_VERSION}/health`, (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date() });
});

// ========== 3. EXAM BUILDER ENDPOINT ==========
app.post(`${API_VERSION}/build-exam`, async (req, res) => {
    try {
        const examConfig = req.body;
        console.log("Received exam build request:", examConfig);

        // Validation
        if (!examConfig.class || !examConfig.subject || !examConfig.chapters || examConfig.chapters.length === 0) {
            return res.status(400).json({ error: "Class, Subject, and at least one Chapter are required." });
        }

        // Fetch relevant questions from Firestore
        const questionsQuery = await db.collection('questions')
            .where('class', '==', examConfig.class)
            .where('subject', '==', examConfig.subject)
            .where('chapter', 'in', examConfig.chapters)
            .get();

        const availableQuestions = questionsQuery.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (availableQuestions.length === 0) {
            return res.json({
                sections: [],
                warning: "No sufficient questions available in the question bank for the requested exam structure."
            });
        }

        // Compose the AI prompt
        const buildPrompt = `You are an expert exam paper creator for St. Patrick's School.
Your job: From ONLY the below "Available Questions", build an exam paper as per teacher's config.
${examConfig.prompt ? "Additional Teacher Prompt: " + examConfig.prompt : ""}
-----
Exam Details:
- Exam Name: ${examConfig.examName}
- Class: ${examConfig.class}
- Subject: ${examConfig.subject}
- Chapters: ${examConfig.chapters.join(", ")}
- Date: ${examConfig.date || ""}
- Time: ${examConfig.time || ""}

Only use the below questions (JSON):
${JSON.stringify(availableQuestions)}

Instructions:
1. Use only these questions.
2. Organize into sections if described in the prompt.
3. If unable to fulfill (e.g., not enough questions for a section), include a clear warning in your JSON under "warning".
4. Respond ONLY as a valid JSON object:
{
  "sections": [
    { "title": "Section A", "questions": [ { "id": "...", "meta": "...", "text": "..." }, ... ] },
    ...
  ],
  "warning": "..." // if any
}
        `.trim();
        // Call OpenAI
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: buildPrompt }],
            response_format: { type: "json_object" },
            max_tokens: 4000
        });

        // Parse AI output
        let examPaper = {};
        try {
            examPaper = JSON.parse(response.choices[0].message.content);
        } catch (e) {
            // If AI output is not valid JSON, fallback
            return res.json({
                sections: [],
                warning: "AI returned an unexpected response. Please try again or review your prompt."
            });
        }

        // Ensure at least warning if no sections
        if ((!examPaper.sections || examPaper.sections.length === 0) && !examPaper.warning) {
            examPaper.warning = "No sufficient questions available in the question bank for the requested exam structure.";
        }

        res.json(examPaper);

    } catch (error) {
        console.error(`Error in /build-exam:`, error);
        res.status(500).json({ error: "An internal error occurred while building the exam paper." });
    }
});

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
