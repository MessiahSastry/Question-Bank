const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
require("dotenv").config();
const path = require("path");

const app = express();

app.use(cors());
app.use(express.static(__dirname));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

app.get("/question-generator", (req, res) => {
  res.sendFile(path.join(__dirname, "ai-question-generator.html"));
});

app.get("/", (req, res) => {
  res.send("Backend running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));