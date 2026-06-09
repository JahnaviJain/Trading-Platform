// TradingPage.js
import React, { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

import OrderExecutionUI from "./OrderExecutionUI";
import NewsPage from "./NewsPage";
import Prediction from "./Prediction"; // ✅ Prediction component
import "./TradingPage.css";

const TradingPage = () => {
  const { symbol } = useParams(); // stock symbol from route
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        setFirstName(decoded.firstName || "");
      } catch (error) {
        console.error("Invalid token:", error);
        handleLogout();
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <div className="trade-page-wrapper">
      <header className="trade-header">
        <div className="trade-title">📊 Tradify</div>
        <nav className="trade-nav">
          <Link to="/home">Home</Link>
          <Link to="/wallet/balance">Wallet</Link>
          <Link to="/portfolio">Profile</Link>
          {firstName && <span className="welcome-message">Hi, {firstName} 👋</span>}
          <button onClick={handleLogout} className="logout-button">Logout</button>
        </nav>
      </header>

      <main className="trading-page-container">
        {/* ✅ Left panel with order execution and prediction */}
        <div className="left-panel">
          <OrderExecutionUI />
          
          {/* 👇 Add prediction chart here */}
          <div className="prediction-section" style={{ marginTop: "30px" }}>
            <h3 style={{ textAlign: "center" }}>📈 Prediction Chart</h3>
            <Prediction stockSymbol={symbol} />
          </div>
        </div>

        {/* ✅ Right panel with news */}
        <div className="right-panel">
          <NewsPage ticker={symbol} />
        </div>
      </main>
    </div>
  );
};

export default TradingPage;
