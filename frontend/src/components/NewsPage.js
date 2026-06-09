// NewsPage.js

import React, { useEffect, useState, useCallback } from "react";
import "./NewsPage.css"; 

const NewsPage = ({ ticker }) => {
  const [news24h, setNews24h] = useState([]);
  const [summary, setSummary] = useState(null);

  const parseTime = (raw) => {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    const hour = raw.slice(9, 11);
    const minute = raw.slice(11, 13);
    const second = raw.slice(13, 15);
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  };

  const formatDate = (raw) => {
    return parseTime(raw).toLocaleString("en-GB");
  };

  const fetchNews = useCallback(async () => {
    if (!ticker) return;
    try {
      const response = await fetch("/august.json"); // Assuming this is your local data file
      const data = await response.json();
      const now = new Date();
      const fromTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const allArticles = Object.values(data).flat();

      const filtered = allArticles.filter((article) => {
        if (!article.ticker_sentiment) return false;
        const mentionsTicker = article.ticker_sentiment.some(
          (t) => t.ticker.toUpperCase() === ticker.toUpperCase()
        );
        if (!mentionsTicker) return false;
        const published = parseTime(article.time_published);
        return published >= fromTime && published <= now;
      });

      const uniqueArticles = Array.from(
        new Map(filtered.map((item) => [item.title, item])).values()
      );

      uniqueArticles.sort((a, b) => b.time_published.localeCompare(a.time_published));
      setNews24h(uniqueArticles);

      // Sentiment Summary Logic (unchanged)
      const sentimentCounts = { Bullish: 0, Bearish: 0, Neutral: 0 };
      let totalScore = 0;
      let totalMentions = 0;
      for (const article of uniqueArticles) {
        const match = article.ticker_sentiment.find((t) => t.ticker.toUpperCase() === ticker.toUpperCase());
        if (match) {
          const label = match.ticker_sentiment_label;
          if(label.includes("Bullish")) sentimentCounts.Bullish++;
          else if(label.includes("Bearish")) sentimentCounts.Bearish++;
          else sentimentCounts.Neutral++;
          totalScore += parseFloat(match.ticker_sentiment_score);
          totalMentions++;
        }
      }
      setSummary({
        totalArticles: uniqueArticles.length,
        ...sentimentCounts,
        avgSentiment: totalMentions ? (totalScore / totalMentions).toFixed(2) : "0.00",
      });
    } catch (err) {
      console.error("News fetch error:", err);
    }
  }, [ticker]);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  const getSentimentClass = (label) => {
    if (label.includes("Bullish")) return "sentiment-bullish";
    if (label.includes("Bearish")) return "sentiment-bearish";
    return "sentiment-neutral";
  };

  const getAvgSentimentClass = (score) => {
    if (score > 0.15) return "sentiment-bullish";
    if (score < -0.15) return "sentiment-bearish";
    return "sentiment-neutral";
  };

  // Calculate a dynamic animation duration based on the number of articles.
  // This makes the scroll speed feel consistent.
  const animationDuration = Math.max(15, news24h.length * 3.5);

  return (
    <div className="news-container">
      <h2>📈 News & Sentiment for {ticker.toUpperCase()}</h2>

      {summary && (
        <div className="summary-box">
          <h3>🧠 Sentiment Summary (24h)</h3>
          <p>Total Articles: <strong>{summary.totalArticles}</strong></p>
          <div className="sentiment-counts">
              <p>Bullish: <strong className="sentiment-bullish">{summary.Bullish}</strong></p>
              <p>Bearish: <strong className="sentiment-bearish">{summary.Bearish}</strong></p>
              <p>Neutral: <strong className="sentiment-neutral">{summary.Neutral}</strong></p>
          </div>
          <p>Avg. Sentiment: <strong className={getAvgSentimentClass(summary.avgSentiment)}>{summary.avgSentiment}</strong></p>
        </div>
      )}

      <h3>🕒 Recent Articles</h3>
      {news24h.length > 0 ? (
        // MARQUEE EFFECT CONTAINER
        <div className="article-list-container">
          <ul 
            className="article-list" 
            style={{ animationDuration: `${animationDuration}s` }}
          >
            {/* RENDER THE LIST OF ARTICLES TWICE FOR A SEAMLESS LOOP */}
            {[...news24h, ...news24h].map((article, index) => {
              const sentiment = article.ticker_sentiment.find((t) => t.ticker.toUpperCase() === ticker.toUpperCase());
              const sentimentLabel = sentiment?.ticker_sentiment_label || "N/A";
              const sentimentScore = parseFloat(sentiment?.ticker_sentiment_score || 0).toFixed(2);
              const sentimentClass = getSentimentClass(sentimentLabel);
              return (
                <li key={index} className={`article-item ${sentimentClass}-border`}>
                  <h4 className="article-title">{article.title}</h4>
                  <div className="article-meta">
                    <p>Sentiment: <strong className={sentimentClass}>{sentimentLabel} ({sentimentScore})</strong></p>
                    <p>Published: {formatDate(article.time_published)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="no-news-message">
          ⚠️ No news found in the past 24 hours for {ticker.toUpperCase()}.
        </p>
      )}
    </div>
  );
};

export default NewsPage;