const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");
const multer = require("multer");
const pdfParse = require("pdf-parse"); // <-- ADDED for PDF processing
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

// --- MULTER CONFIGURATION (UPDATED) ---
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB file size limit
    fileFilter: (req, file, cb) => {
        // Updated to allow both images and PDFs
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

// --- API ROUTES ---

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

// ========== 2. AI File-Based Question Extraction (FULLY UPDATED) ==========
app.post(`${API_VERSION}/extract-from-image`, upload.single("imageFile"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
    }
    try {
        const teacherPrompt = req.body.prompt || "Please transcribe all questions from the document.";
        let aiResponse;

        // --- A. IF THE FILE IS AN IMAGE ---
        if (req.file.mimetype.startsWith("image/")) {
            const imageBase64 = req.file.buffer.toString("base64");
            const masterPrompt = `
                You are an expert AI assistant for St. Patrick's School. Your task is to extract and format questions from an image provided by a teacher.
                The teacher's specific request is: "${teacherPrompt}"
                ---
                **YOUR INSTRUCTIONS:**
                Follow the teacher's request and format every single question you output according to this strict structure:
                1.  **Meta-data Line:** Each question MUST begin on a new line with the pattern "Q<number>: <Difficulty>/Level <Lvl>, <Marks> Marks". You must estimate the difficulty, level, and marks.
                2.  **Question Line:** The text of the question must follow on the next line.
                3.  **MCQ Formatting:** If it is a multiple-choice question, the options (A, B, C, D) and the final answer ("Ans: ...") should follow.
                4.  **LaTeX:** All mathematical equations must be in proper LaTeX format.
                ---
                Now, process the attached image based on the teacher's request and follow all formatting instructions. Provide ONLY the formatted questions as your response.
            `;

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: masterPrompt },
                        { type: "image_url", image_url: { url: `data:${req.file.mimetype};base64,${imageBase64}` } },
                    ],
                }],
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

// ========== ERROR HANDLING MIDDLEWARE ==========
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
