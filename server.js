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

// ========== AI Image Text Extraction ==========
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

// ========== NEW: AI EXAM PAPER OPTIMIZATION & QUESTION SELECTION ==========
app.post("/api/optimize-exam-paper", async (req, res) => {
    const { examData, allFetchedQuestionsPerSection } = req.body;

    if (!examData || !allFetchedQuestionsPerSection) {
        return res.status(400).json({ error: "Exam data and fetched questions are required." });
    }

    // Construct a detailed prompt for GPT-4o
    let optimizationPrompt = `You are an expert exam paper creator for St. Patrick's School. Your task is to select and arrange questions for an exam based on the provided criteria and a pool of available questions.

Exam Details:
Class: ${examData.ebClass}
Subject: ${examData.ebSubject}
Exam Name: ${examData.ebExamName}
Exam Type: ${examData.ebExamType}
${examData.ebMcqLevel ? `Overall MCQ Level: ${examData.ebMcqLevel}\n` : ''}
Max Marks: ${examData.ebMaxMarks}
Overall Difficulty: ${examData.ebDifficulty}
${examData.ebDifficulty === 'Mixed By Percentage' ?
`Difficulty Mix: Easy: ${examData.ebDiffEasyPerc}%, Medium: ${examData.ebDiffMediumPerc}%, Difficult: ${examData.ebDiffHardPerc}%\n` : ''}
Chapters: ${examData.ebChapters ? examData.ebChapters.join(', ') : 'N/A'}

Available Questions and Section Requirements:
`;

    allFetchedQuestionsPerSection.forEach((sectionData, index) => {
        optimizationPrompt += `\nSection ${index + 1}: "${sectionData.sectionTitle}"
  - Instructions: ${sectionData.sectionCriteria.instructions || 'None'}
  - Requires: ${sectionData.sectionCriteria.numQuestions} questions
  - Question Type: ${sectionData.sectionCriteria.questionType}
  - Marks per Question: ${sectionData.sectionCriteria.marksPerQuestion}
  ${sectionData.sectionCriteria.questionType === 'MCQs' && sectionData.sectionCriteria.mcqLevel ? `  - MCQ Level (Section): ${sectionData.sectionCriteria.mcqLevel}\n` : ''}
  - Available Pool (${sectionData.availableQuestions.length} questions - see list below, identified by "qid"):
`;
        if (sectionData.availableQuestions.length > 0) {
            sectionData.availableQuestions.forEach(q => {
                // Include essential metadata for AI selection.
                // Ensure these fields (marks, difficulty, level, chapter, type if available) exist on your question objects.
                optimizationPrompt += `    - qid: ${q.id}, Marks: ${q.marks || 'N/A'}, Difficulty: ${q.difficulty || 'N/A'}, Level: ${q.level || 'N/A'}, Chapter: "${q.chapter || 'N/A'}", Type: ${q.type || 'N/A'}\n`; // Added q.type
                // optimizationPrompt += `      Question Text (first 50 chars): ${q.body ? q.body.substring(0, 50).replace(/\n/g, " ") + "..." : "N/A"}\n`; // Optional: give AI a peek at question text, ensure no newlines
            });
        } else {
            optimizationPrompt += `    - No questions available in the pool for this section based on initial broad fetch.\n`;
        }
    });

    optimizationPrompt += `
Instructions for AI:
1.  For each section, select exactly the required number of questions ("Requires" field) from its "Available Pool".
2.  The selected questions MUST match the section's "Question Type", "Marks per Question", and if applicable, "MCQ Level (Section)". Use the "Type", "Marks", and "Level" fields from the available questions.
3.  Adhere to the "Overall Difficulty" goal for the entire paper. If "Mixed By Percentage" is specified, strive to meet the percentage mix across all selected questions. Use the "Difficulty" field of the available questions (e.g., "Easy", "Medium", "Difficult", "Easy/Level 1", etc.). You may need to balance easy/medium/difficult questions across sections to achieve this.
4.  CRITICAL: Ensure NO question (by its "qid") is repeated anywhere in the entire exam (across all sections). Each selected question must be unique.
5.  If a section's "Available Pool" is empty or insufficient to meet ALL requirements (number, type, marks, difficulty, uniqueness), clearly state this in your response for that section. Do not invent questions. Try your best to fulfill other sections if possible.
6.  Return your response as a VALID JSON object. The JSON object MUST have a key "selectedSections" which is an array. Each element in the array corresponds to a section and MUST be an object with "sectionTitle" (string), "selectedQuestionIds" (an array of "qid" strings of the chosen questions for that section, in the order they should appear), and "fulfillmentWarning" (string or null). If a section cannot be fulfilled, "selectedQuestionIds" should be an empty array, and "fulfillmentWarning" should explain why (e.g., "Insufficient 'Easy' MCQs with 2 marks after ensuring uniqueness.").

Example of desired JSON output format:
{
  "selectedSections": [
    {
      "sectionTitle": "Section A: Long Answers",
      "selectedQuestionIds": ["qid_firestore_123", "qid_firestore_456"],
      "fulfillmentWarning": null
    },
    {
      "sectionTitle": "Section B: MCQs",
      "selectedQuestionIds": [],
      "fulfillmentWarning": "Could not find enough 'Easy' MCQs for 2 marks each from the available pool for Chapter X, while maintaining uniqueness."
    }
  ]
}

Provide ONLY the JSON object in your response. Do not include any other text before or after the JSON object.
`;

    // console.log("DEBUG: Sending this prompt to OpenAI for optimization:\n", optimizationPrompt); // For debugging during development

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: optimizationPrompt }],
            temperature: 0.2, 
            max_tokens: 3500, // Increased slightly for potentially complex JSON and warnings
            response_format: { type: "json_object" },
        });

        if (response.choices && response.choices.length > 0 && response.choices[0].message && response.choices[0].message.content) {
            const aiResponseContent = response.choices[0].message.content;
            // console.log("DEBUG: AI Raw Response Content:", aiResponseContent); // For debugging
            try {
                const optimizedExam = JSON.parse(aiResponseContent);
                
                // Basic validation of the AI's response structure
                if (!optimizedExam.selectedSections || !Array.isArray(optimizedExam.selectedSections)) {
                     throw new Error("AI response is not in the expected JSON format: 'selectedSections' array is missing or not an array.");
                }
                optimizedExam.selectedSections.forEach((section, index) => {
                    if (typeof section.sectionTitle === 'undefined' || !Array.isArray(section.selectedQuestionIds)) {
                        throw new Error(`AI response for section ${index + 1} ('${section.sectionTitle || 'Untitled'}') is not in the expected format: 'sectionTitle' or 'selectedQuestionIds' is missing/invalid.`);
                    }
                });

                res.json(optimizedExam);
            } catch (parseError) {
                console.error("Error parsing AI JSON response for /api/optimize-exam-paper:", parseError.message, "\nAI Raw Content:", aiResponseContent);
                res.status(500).json({ error: "Failed to parse AI's optimization response. Check server logs for AI's raw output." });
            }
        } else {
            console.error("Invalid or empty response structure from AI for exam optimization. Full AI response object:", response);
            res.status(500).json({ error: "Invalid or empty response structure from AI for exam optimization." });
        }
    } catch (error) {
        console.error("Error calling OpenAI for /api/optimize-exam-paper:", error);
        res.status(500).json({ error: error.message || "Failed to optimize exam paper using AI." });
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
