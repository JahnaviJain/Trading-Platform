const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, // or String if you're using user IDs as strings
    required: true,
  },
  messages: [
    {
      role: String, // 'user' or 'bot'
      text: String,
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model("Chat", chatSchema);
