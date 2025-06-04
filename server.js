const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
require("dotenv").config();
const path = require("path");

const app = express();

app.use(cors());
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
      model: "gpt-4-turbo",
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
      model: "gpt-4-turbo",
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
    // Safe fallback
    res.json(tag || { difficulty: "Medium", marks: 4 });
  } catch (error) {
    res.status(500).json({ error: error.message || error.toString() });
  }
});

// ========== Static & Health Endpoints ==========
app.get("/", (req, res) => {
  res.send("Backend running!");
});

// ========== Start Server ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
