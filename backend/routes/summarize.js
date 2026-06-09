const express = require("express");
const axios = require("axios");
const router = express.Router();
require("dotenv").config();

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

router.post("/summarize", async (req, res) => {
  const { ticker, articles } = req.body;

  try {
    let bullish = 0, bearish = 0, neutral = 0;
    let totalScore = 0, totalMentions = 0;

    articles.forEach((article) => {
      const match = article.ticker_sentiment.find(t => t.ticker === ticker);
      if (match) {
        const label = match.ticker_sentiment_label;
        const score = parseFloat(match.ticker_sentiment_score);

        if (label === "Bullish") bullish++;
        else if (label === "Bearish") bearish++;
        else neutral++;

        totalScore += score;
        totalMentions++;
      }
    });

    const avgSentiment = totalMentions ? (totalScore / totalMentions).toFixed(2) : "0.00";

    const prompt = `
Based on the following sentiment analysis for stock ticker "${ticker}":
- Bullish articles: ${bullish}
- Bearish articles: ${bearish}
- Neutral articles: ${neutral}
- Average sentiment score: ${avgSentiment}

Write a short financial summary about how the stock is currently perceived.
`;

    const hfResponse = await axios.post(
      "https://api-inference.huggingface.co/models/facebook/bart-large-cnn",
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
        },
      }
    );

    const summary = hfResponse.data[0]?.summary_text || "No summary available.";
    res.json({ summary });
  } catch (error) {
    console.error("Summarization error:", error.message);
    res.status(500).json({ error: "Failed to generate summary." });
  }
});

module.exports = router;
