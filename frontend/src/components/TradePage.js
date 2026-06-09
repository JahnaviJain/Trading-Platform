import React, { useEffect, useState, useRef, useCallback } from "react";
import "./TradePage.css";
import { Link } from "react-router-dom";
import io from "socket.io-client";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const equities = ["AAPL", "GOOG", "MSFT", "TSLA", "IBM", "WMT", "UL"];

const TradePage = () => {
  const [prices, setPrices] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [marketStatus, setMarketStatus] = useState("Loading...");
  const [isMarketClosed, setIsMarketClosed] = useState(true);
  const navigate = useNavigate();
  const [marketNews, setMarketNews] = useState([]);
  const [chatMessages, setChatMessages] = useState([
    { type: 'bot', text: 'Welcome! Ask me about stocks, news, or your portfolio.' }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [userId, setUserId] = useState("");
  // IMPORTANT: Replace with your actual NewsAPI key
  const NEWS_API_KEY = "be3ef79e66df48bd84f0e5eb6dd1d609";
  const chatMessagesEndRef = useRef(null);

  const initialFetchDone = useRef(false);
  const [watchlist, setWatchlist] = useState(new Set());

  const fetchWatchlist = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (token) {
        const { data } = await axios.get("http://localhost:8080/api/watchlist", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setWatchlist(new Set(data));
      }
    } catch (error) {
      console.error("Failed to fetch watchlist:", error);
    }
  }, []);

  const handleWatchlistToggle = async (symbol) => {
    try {
      const token = localStorage.getItem("token");
      const isWatched = watchlist.has(symbol);
      const endpoint = isWatched ? "remove" : "add";

      await axios.post(
        `http://localhost:8080/api/watchlist/${endpoint}`,
        { symbol },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setWatchlist(prev => {
        const newWatchlist = new Set(prev);
        if (isWatched) {
          newWatchlist.delete(symbol);
        } else {
          newWatchlist.add(symbol);
        }
        return newWatchlist;
      });

    } catch (error) {
      console.error(`Failed to toggle watchlist:`, error);
    }
  };

  const handleTradeClick = (symbol) => {
    navigate(`/trade/${symbol}`);
  };

  const getMarketStatus = () => {
    const now = new Date();
    const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const day = istNow.getUTCDay();
    const hour = istNow.getUTCHours();
    const minute = istNow.getUTCMinutes();
    if (day === 0 || day === 6) return { status: "Market Closed", isOpen: false, detail: "It's the weekend." };
    if (hour < 9 || (hour === 9 && minute < 30)) return { status: "Market Closed", isOpen: false, detail: "Opens at 9:30 AM IST." };
    if (hour >= 16) return { status: "Market Closed", isOpen: false, detail: "Market hours have ended." };
    return { status: "Market Open", isOpen: true, detail: "Hours: 9:30 AM - 4:00 PM IST" };
  };

  const calculateChange = (current, open) => {
    if (!open || open === 0) return 0;
    return (((current - open) / open) * 100).toFixed(2);
  };

  const getTopMovers = () => {
    const movers = equities.map(symbol => {
      const data = prices[symbol];
      if (!data || !data.ltp || !data.open || data.open === 0) return null;
      const change = calculateChange(data.ltp, data.open);
      return { symbol, change: parseFloat(change) };
    }).filter(item => item !== null);
    const allGainers = movers.filter(stock => stock.change >= 0).sort((a, b) => b.change - a.change);
    const allLosers = movers.filter(stock => stock.change < 0).sort((a, b) => a.change - b.change);
    return { gainers: allGainers.slice(0, 3), losers: allLosers.slice(0, 3) };
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        setFirstName(decoded.firstName);
        setUserId(decoded._id);
      } catch (e) { navigate("/login"); }
    } else {
      navigate("/login");
    }

    const fetchMarketNews = async () => {
      console.log("Fetching market news...");
      try {
        const response = await axios.get("https://newsapi.org/v2/top-headlines", {
          params: {
            apiKey: NEWS_API_KEY,
            q: "stock market",
            language: "en",
            category: "business",
            pageSize: 20
          },
        });

        console.log("news data", response.data)
        
        if (response.data && response.data.articles) {
            setMarketNews(response.data.articles.slice(0, 100));
            
        } else {
            setMarketNews([{ title: "No news articles found.", url: "#" }]);
        }
      } catch (error) {
        console.error("Error fetching market news:", error);
        if (error.response && error.response.status === 429) {
             setMarketNews([{ title: "News API rate limit exceeded. Please try again later.", url: "#" }]);
        } else {
             setMarketNews([{ title: "Could not load news.", url: "#" }]);
        }
      }
    };

    if (!initialFetchDone.current) {
        fetchWatchlist();
        fetchMarketNews();
        initialFetchDone.current = true;
    }

    const updateMarketStatus = () => {
      const { status, isOpen } = getMarketStatus();
      setMarketStatus(status);
      setIsMarketClosed(!isOpen);
    };
    updateMarketStatus();
    
    const statusInterval = setInterval(updateMarketStatus, 60000);
    // *** FIX #2: Set interval to 5 minutes (300,000 ms) ***
    const newsInterval = setInterval(fetchMarketNews, 300000); 

    const socket = io("http://localhost:8080");
    socket.on("bulkPrice", (priceData) => setPrices(priceData));
    socket.on("ohlcWithBidAsk", (data) => {
      setPrices(prev => ({ ...prev, [data.symbol]: data }));
    });

    return () => {
      clearInterval(statusInterval);
      clearInterval(newsInterval);
      socket.disconnect();
    };
  }, [navigate, fetchWatchlist]);

  const filteredEquities = equities.filter((eq) =>
    eq.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { type: "user", text: chatInput };
    setChatMessages((prev) => [...prev, userMsg]);
    try {
      const response = await axios.post("http://localhost:8080/api/chat", {
        message: chatInput,
        userId: userId,
      });
      const botMsg = { type: "bot", text: response.data.reply };
      setChatMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      const errMsg = { type: "bot", text: "⚠️ Failed to get response." };
      setChatMessages((prev) => [...prev, errMsg]);
    }
    setChatInput("");
  };

  const { gainers, losers } = getTopMovers();
  const { detail: marketDetail } = getMarketStatus();

  return (
    <div className="trade-container">
      <header className="trade-header">
        <div className="trade-title">📊 Tradify</div>
        <nav className="trade-nav">
          <Link to="/home">Home</Link>
          <Link to="/stat">Market Stats</Link>
          <Link to="/wallet/balance">Wallet</Link>
          <Link to="/watchlist">Watchlist</Link>
          <Link to="/portfolio">Portfolio</Link>
          {firstName && <span className="welcome-message">Hi, {firstName} 👋</span>}
          <button onClick={handleLogout} className="logout-button">Logout</button>
        </nav>
      </header>
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search stocks (e.g., AAPL, GOOG)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="trade-content">
        <div className="main-section">
          <h2>Live Market Overview</h2>
          <div className="equities-section">
            {filteredEquities.map(stock => {
              const data = prices[stock];
              const hasData = data && typeof data.ltp === 'number';
              const changeValue = hasData ? calculateChange(data.ltp, data.open) : 0;
              const isUp = changeValue >= 0;
              const isWatched = watchlist.has(stock);
              return (
                <div key={stock} className="equity-card">
                  <h3>{stock}</h3>
                  {hasData ? (
                    <>
                      <p className="price">${data.ltp.toFixed(2)}</p>
                      <p className={`change ${isUp ? "up" : "down"}`}>
                        {isUp ? "▲" : "▼"} {Math.abs(changeValue)}%
                      </p>
                      <button className="follow-btn" onClick={() => handleTradeClick(stock)}>Trade</button>
                    </>
                  ) : (<p>Loading...</p>)}
                   <button
                        className={`watchlist-btn ${isWatched ? 'watched' : ''}`}
                        onClick={() => handleWatchlistToggle(stock)}
                        title={isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}
                    >
                        {isWatched ? '★' : '☆'}
                    </button>
                </div>
              );
            })}
          </div>
          <div className="market-section">
            <div className="gainers">
              <h3>Top Gainers</h3>
              <ul>
                {gainers.length > 0 ? gainers.map(({ symbol, change }) => (
                  <li key={symbol}><span>{symbol}</span> ↑ {change}%</li>
                )) : <li>-</li>}
              </ul>
            </div>
            <div className="losers">
              <h3>Top Losers</h3>
              <ul>
                {losers.length > 0 ? losers.map(({ symbol, change }) => (
                  <li key={symbol}><span>{symbol}</span> ↓ {Math.abs(change)}%</li>
                )) : <li>-</li>}
              </ul>
            </div>
          </div>
          <div className="news-feed">
            <h3>Latest Trading News</h3>
            <ul>
              {marketNews.length > 0 ? (
                marketNews.map((article, index) => (
                  <li key={index}>
                    <a href={article.url} target="_blank" rel="noopener noreferrer">
                      {article.title}
                    </a>
                  </li>
                ))
              ) : (
                <li>Loading news...</li>
              )}
            </ul>
          </div>
        </div>
        <aside className="sidebar">
          <div className="market-status-widget">
            <h3>Market Status</h3>
            <div className={`status-indicator ${isMarketClosed ? "closed" : "open"}`}>
              <span className="status-dot"></span>
              <span className="status-text">{marketStatus}</span>
            </div>
            <p className="status-detail">{marketDetail}</p>
          </div>
          <div className="chatbot-widget">
            <h3>🤖 StockBot Assistant</h3>
            <div className="chat-messages">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-msg ${msg.type}`}>{msg.text}</div>
              ))}
              <div ref={chatMessagesEndRef} />
            </div>
            <div className="chat-input">
              <input
                type="text"
                value={chatInput}
                placeholder="Ask anything..."
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <button onClick={handleSendMessage}>Send</button>
            </div>
          </div>
        </aside>
      </div>
      <footer className="footer">
        © {new Date().getFullYear()} Tradify — Your Professional Trading Hub
      </footer>
    </div>
  );
};

export default TradePage;



