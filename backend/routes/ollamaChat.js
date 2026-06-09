// const express = require("express");
// const axios = require("axios");
// const router = express.Router();

// router.post("/chat", async (req, res) => {
//   const { message } = req.body;

//   try {
//     const response = await axios.post("http://localhost:11434/api/generate", {
//       model: "phi",
//       prompt: `You are a helpful assistant who provides concise and accurate answers about the stock market, finance, and trading. Always include real-time insights where possible.

// User: ${message}
// Assistant:`,
//       stream: false,
//     });

//     console.log("Ollama reply:", response.data.response);
//     res.json({ reply: response.data.response });

//   } catch (error) {
//     console.error("Ollama error:", error.response?.data || error.message);
//     res.status(500).json({ error: "Failed to get response from model" });
//   }
// });

// module.exports = router;


// const express = require("express");
// const axios = require("axios");
// const mongoose = require("mongoose");
// const Chat = require("../models/chat");

// const router = express.Router();

// router.post("/chat", async (req, res) => {
//   const { message, userId } = req.body;

//   if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
//     return res.status(400).json({ error: "Invalid or missing userId" });
//   }

//   try {
//     const objectId = new mongoose.Types.ObjectId(userId);

//     // Get latest chat or create new
//     let chat = await Chat.findOne({ userId: objectId }).sort({ createdAt: -1 });
//     if (!chat || chat.messages.length > 20) {
//       chat = new Chat({ userId: objectId, messages: [] });
//     }

//     // Add user message
//     chat.messages.push({ role: "user", text: message });

//     // Build context from last 10 messages
//     const context = chat.messages.slice(-10)
//       .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
//       .join("\n");

//     const prompt = `You are a helpful AI assistant for stock market analysis.\n${context}\nAssistant:`;

//     const response = await axios.post("http://localhost:11434/api/generate", {
//       model: "phi",
//       prompt,
//       stream: false,
//     });

//     const aiText = response.data.response;

//     // Add bot message and save
//     chat.messages.push({ role: "bot", text: aiText });
//     await chat.save();

//     res.json({ reply: aiText });
//   } catch (error) {
//     console.error("Chat error:", error.response?.data || error.message);
//     res.status(500).json({ error: "Failed to get response from model" });
//   }
// });

// router.get("/history/:userId", async (req, res) => {
//   try {
//     const chats = await Chat.find({ userId: req.params.userId }).sort({ createdAt: -1 });

//     const summaries = chats.map((chat) => {
//       const previewMessages = chat.messages.slice(0, 2); // First two messages
//       const preview = previewMessages.map((m) => `${m.role === "user" ? "You" : "Bot"}: ${m.text}`).join(" | ");

//       return {
//         id: chat._id,
//         preview,
//         date: chat.createdAt,
//       };
//     });

//     res.json(summaries);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Failed to fetch chat history" });
//   }
// });


// module.exports = router;



const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const Chat = require("../models/chat");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const router = express.Router();

// --- Gemini AI Initialization ---
// Get your API key from Google AI Studio and set it as an environment variable
// (e.g., in a .env file)
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash", // Use a suitable model
  systemInstruction: "You are a helpful assistant who provides concise and accurate answers about the stock market, finance, and trading. Always include real-time insights where possible.",
});


// --- Chat Endpoint ---
router.post("/chat", async (req, res) => {
  const { message, userId } = req.body;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: "Invalid or missing userId" });
  }

  try {
    const objectId = new mongoose.Types.ObjectId(userId);

    // Get the most recent chat session for the user
    let chat = await Chat.findOne({ userId: objectId }).sort({ createdAt: -1 });

    // If no chat exists, or it has grown too long, create a new one
    if (!chat || chat.messages.length > 20) {
      chat = new Chat({ userId: objectId, messages: [] });
    }

    // --- Prepare history for Gemini API ---
    // The Gemini API requires a specific format for conversation history.
    // We also only take the last 10 messages to keep the context relevant.
    const history = chat.messages.slice(-10).map(msg => ({
      role: msg.role === 'bot' ? 'model' : 'user', // Map 'bot' to 'model'
      parts: [{ text: msg.text }],
    }));

    // --- Interact with Gemini API ---
    const chatSession = model.startChat({
      history: history,
      generationConfig: {
        maxOutputTokens: 2000,
      },
    });

    const result = await chatSession.sendMessage(message);
    const response = result.response;
    const aiText = response.text();

    // --- Save conversation to Database ---
    // Add the user's message and the AI's reply to our database
    chat.messages.push({ role: "user", text: message });
    chat.messages.push({ role: "bot", text: aiText });
    await chat.save();

    // Send the AI's reply back to the client
    res.json({ reply: aiText });

  } catch (error) {
    console.error("Gemini API error:", error);
    res.status(500).json({ error: "Failed to get response from the model" });
  }
});


// --- Chat History Endpoint (No changes needed here) ---
router.get("/history/:userId", async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.params.userId }).sort({ createdAt: -1 });

    const summaries = chats.map((chat) => {
      const previewMessages = chat.messages.slice(0, 2);
      const preview = previewMessages.map((m) => `${m.role === "user" ? "You" : "Bot"}: ${m.text}`).join(" | ");

      return {
        id: chat._id,
        preview,
        date: chat.createdAt,
      };
    });

    res.json(summaries);
  } catch (err) {
    console.error("History fetch error:", err);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});


module.exports = router;

