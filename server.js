const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
require("dotenv").config();
const path = require("path");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ========== AI Question Generation ==========
app.post("/generate", async (req, res) => {
  const { prompt } = req.body;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 900,
      temperature: 0.7,
    });
    res.json({ result: response.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message || error.toString() });
  }
});

// ========== AI-Assisted Tagging ==========
app.post("/tag-question", async (req, res) => {
  const { question } = req.body;
  try {
    const tagPrompt = `
      Analyze the following question and reply with a JSON like {"difficulty":"Easy/Medium/Difficult","marks":1/2/4/6/8/10}.
      Only use marks: 1, 2, 4, 6, 8, or 10.
      Question: ${question}
    `;
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: tagPrompt }],
      max_tokens: 60,
      temperature: 0,
    });
    let tag;
    try {
      tag = JSON.parse(response.choices[0].message.content);
    } catch {
      tag = null;
    }
    res.json(tag || { difficulty: "Medium", marks: 4 });
  } catch (error) {
    res.status(500).json({ error: error.message || error.toString() });
  }
});

// ========== AI Math Conversion ==========
app.post("/convert-math", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.json({ error: "No input" });
  const prompt = `
Convert the following math problem/expression from plain text to LaTeX format.
Reply with ONLY the LaTeX code between $$, no explanation.

Text: ${text}
`;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 128,
      temperature: 0,
    });
    const content = response.choices[0].message.content || "";
    const match = content.match(/\$\$(.*?)\$\$/s);
    const latex = match ? match[1].trim() : content.trim();
    res.json({ latex });
  } catch (e) {
    res.json({ error: e.message || "AI error" });
  }
});

// ========== Health Check ==========
app.get("/", (req, res) => {
  res.send("Backend running!");
});

// ========== Start Server ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
