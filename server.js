const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const multer = require("multer"); // Added multer
require("dotenv").config();
const path = require("path");

const app = express();

// CORS configuration
app.use(cors({ origin: "*" }));
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for potential base64 image in other requests if any
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));


// Multer setup for image uploads (memory storage)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB file size limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Not an image! Please upload an image file."), false);
    }
  },
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ========== AI Question Generation ==========
app.post("/generate", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000, // Increased max_tokens for potentially longer outputs
      temperature: 0.7,
    });
    if (response.choices && response.choices.length > 0 && response.choices[0].message) {
        res.json({ result: response.choices[0].message.content });
    } else {
        res.status(500).json({ error: "Invalid response structure from AI." });
    }
  } catch (error) {
    console.error("Error calling OpenAI for /generate:", error);
    res.status(500).json({ error: error.message || "Failed to generate questions from AI." });
  }
});

// ========== NEW: AI Image Text Extraction ==========
app.post("/api/extract-from-image", upload.single("imageFile"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded." });
  }

  try {
    const imageBuffer = req.file.buffer;
    const imageBase64 = imageBuffer.toString("base64");
    const mimeType = req.file.mimetype; // e.g., image/png, image/jpeg

    const autoPrompt = "Extract all the text and math equations from this image exactly as shown, without adding, rewriting, or summarizing anything. Auto-convert math to LaTeX so they look like real math when rendered. Present the extracted content clearly. If there are distinct questions or sections, try to format them similarly to how one might structure questions, for example, using 'Q 1:', 'Q 2:' prefixes if appropriate, or clear paragraph breaks for distinct text blocks. Ensure LaTeX is correctly delimited for MathJax rendering (e.g., $$...$$ for display math, $...$ for inline math).";

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: autoPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages,
      max_tokens: 3000, // Sufficient tokens for potentially large text extractions
    });

    if (response.choices && response.choices.length > 0 && response.choices[0].message) {
      res.json({ result: response.choices[0].message.content });
    } else {
      res.status(500).json({ error: "Invalid response structure from AI after image processing." });
    }

  } catch (error) {
    console.error("Error processing image with OpenAI:", error);
    if (error.message.includes("Not an image")) { // From multer fileFilter
        return res.status(400).json({ error: "Uploaded file is not a valid image type." });
    }
    res.status(500).json({ error: error.message || "Failed to extract text from image." });
  }
});


// ========== AI-Assisted Tagging (Existing endpoint) ==========
app.post("/tag-question", async (req, res) => {
  // ... (code for /tag-question as previously provided)
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Question is required for tagging." });
  }
  try {
    const tagPrompt =
      `Analyze the following question and reply with a JSON like {"difficulty":"Easy/Medium/Difficult","marks":1/2/4/6/8/10}. ` +
      `Only use marks: 1, 2, 4, 6, 8, or 10. ` +
      `Question: ${question}`;
    const response = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [{ role: "user", content: tagPrompt }],
      max_tokens: 60,
      temperature: 0,
    });
    
    let tagData;
    try {
        const content = response.choices[0].message.content;
        tagData = JSON.parse(content);
    } catch (parseError) {
        console.error("Error parsing AI response for /tag-question:", parseError, "Original content:", response.choices[0].message.content);
        tagData = { difficulty: "Medium", marks: 4, error: "AI response parsing failed" };
    }
    res.json(tagData);

  } catch (error) {
    console.error("Error calling OpenAI for /tag-question:", error);
    res.status(500).json({ error: error.message || "Failed to tag question." });
  }
});

// ========== AI Math Conversion Endpoint (Existing endpoint) ==========
app.post("/convert-math", async (req, res) => {
  // ... (code for /convert-math as previously provided)
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No input text provided for math conversion." });

  const prompt =
    `Convert the following math problem/expression from plain text to LaTeX format. ` +
    `Reply with ONLY the LaTeX code. If it needs to be display math, enclose in $$. If inline, enclose in $. ` +
    `Do not include any explanation or surrounding text. ` +
    `Text: ${text}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [{ role: "user", content: prompt }],
      max_tokens: 256, 
      temperature: 0,
    });

    const content = response.choices[0].message.content || "";
    const latex = content.trim(); 
    res.json({ latex });
  } catch (e) {
    console.error("Error calling OpenAI for /convert-math:", e);
    res.status(500).json({ error: e.message || "AI error during math conversion." });
  }
});

// ========== Static & Health Endpoints ==========
app.get("/", (req, res) => {
  res.send("St. Patrick's Question Bank Backend is running!");
});

// Error handling for multer (e.g., file too large)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        console.error("Multer error:", err);
        return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
        // An unknown error occurred.
        console.error("Unknown error during file processing:", err);
        return res.status(500).json({ error: err.message || "An unexpected error occurred." });
    }
    next();
});


// ========== Start Server ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
