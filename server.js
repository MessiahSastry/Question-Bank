const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");
const multer = require("multer");
require("dotenv").config();
const path = require("path");

const app = express();

// --- CONFIGURATION ---
const API_VERSION = "/api/v1"; // Standard way to version APIs
const ALLOWED_ORIGINS = [
    'https://messiahsastry.github.io', // Your GitHub Pages site
    'https://stpatricks-questionbank.firebaseapp.com', // Keep the Firebase one just in case
    'http://127.0.0.1:5500' // For local testing
];

// --- MIDDLEWARE ---
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Use Express's built-in body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB file size limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("File is not an image."), false);
    }
  },
});

// Serve static files (if you have a 'public' folder for images, etc.)
app.use(express.static(path.join(__dirname, "public")));

// --- OPENAI CLIENT ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- API ROUTES ---

// ========== AI Question Generation ==========
app.post(`${API_VERSION}/extract-from-image`, upload.single("imageFile"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image file uploaded." });
    }
    try {
        const imageBase64 = req.file.buffer.toString("base64");
        // Use the prompt from the teacher, or use a default if it's empty
        const userPrompt = req.body.prompt || 'Extract text and LaTeX from the image.'; 

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: userPrompt }, // Use the teacher's prompt here
                        { type: "image_url", image_url: { url: `data:${req.file.mimetype};base64,${imageBase64}` } },
                    ],
                },
            ],
            max_tokens: 3000,
        });
        res.json({ result: response.choices[0].message.content });
    } catch (error) {
        console.error(`Error in /extract-from-image:`, error);
        res.status(500).json({ error: "Failed to extract text from image." });
    }
});
// ========== AI Image Text Extraction ==========
app.post(`${API_VERSION}/extract-from-image`, upload.single("imageFile"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded." });
  }
  try {
    const imageBase64 = req.file.buffer.toString("base64");
    
    // --- THIS IS THE UPDATED PROMPT ---
    const autoPrompt = `You are an expert academic assistant. Your task is to accurately transcribe the content from the provided image for a teacher who is digitizing their educational materials for a question bank.

    Follow these instructions carefully:
    1.  **Transcribe Text:** Identify and write down all visible text from the image. Maintain the original structure, paragraphs, and line breaks as closely as possible.
    2.  **Transcribe Math:** Identify all mathematical equations and formulas. Convert them into proper LaTeX format. Use $$...$$ for display equations (those on their own line) and $...$ for inline equations (those within a sentence).
    3.  **Do Not Summarize:** Your role is to be a perfect transcriber. Do not summarize, explain, or add any new information that is not explicitly in the image.
    4.  **Preserve Formatting:** If the image contains numbered questions (e.g., "1.", "2.", "Q1:"), preserve that numbering in your transcription.

    The final output should be a clean, digital copy of the image's content with properly formatted mathematics for rendering with MathJax.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: autoPrompt },
            { type: "image_url", image_url: { url: `data:${req.file.mimetype};base64,${imageBase64}` } },
          ],
        },
      ],
      max_tokens: 3000,
    });
    res.json({ result: response.choices[0].message.content });
  } catch (error) {
    console.error(`Error in /extract-from-image:`, error);
    res.status(500).json({ error: "Failed to extract text from image." });
  }
});

// ========== AI Exam Paper Optimization ==========
app.post(`${API_VERSION}/optimize-exam-paper`, async (req, res) => {
    // ... your existing logic for this endpoint ...
    // Note: This endpoint is already well-designed. No changes needed here.
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
