import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import axios from "axios";
import io from "socket.io-client";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { CSVLink } from "react-csv";

import "./Portfolio.css";

// Register all necessary Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

// Establish socket connection
const socket = io("http://localhost:8080");

// Chart for Investment Distribution
const HoldingsChart = ({ data }) => {
    const chartData = {
        labels: data.map(h => h.symbol),
        datasets: [{
            data: data.map(h => h.quantity * h.averageBuyPrice),
            backgroundColor: ['#00D09C', '#FF6384', '#36A2EB', '#FFCE56', '#9966FF'],
            hoverBackgroundColor: ['#00b88a', '#FF4B71', '#2A8CDA', '#FFC13B', '#8A56E5'],
            borderColor: 'var(--secondary-bg)',
            borderWidth: 2,
        }]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right', labels: { color: '#ffffff', boxWidth: 15, padding: 20, font: { size: 14 } } },
            tooltip: {
                callbacks: {
                    label: (context) => `Investment: ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed)}`
                }
            }
        },
        cutout: '60%',
    };
    return (
        <div className="chart_container_doughnut">
            <Doughnut data={chartData} options={options} />
        </div>
    );
};

// NEW: Chart for Profit & Loss per Holding
const ProfitLossChart = ({ data }) => {
    const pnlData = data.map(h => (h.currentPrice - h.averageBuyPrice) * h.quantity);
    const chartData = {
        labels: data.map(h => h.symbol),
        datasets: [{
            label: 'Profit/Loss',
            data: pnlData,
            backgroundColor: pnlData.map(pnl => pnl >= 0 ? 'rgba(0, 208, 156, 0.7)' : 'rgba(244, 67, 54, 0.7)'),
            borderColor: pnlData.map(pnl => pnl >= 0 ? 'rgba(0, 208, 156, 1)' : 'rgba(244, 67, 54, 1)'),
            borderWidth: 1,
        }]
    };
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }, // Hide legend for bar chart
            tooltip: {
                callbacks: {
                    label: (context) => `P/L: ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed.y)}`
                }
            }
        },
        scales: {
            y: {
                ticks: { color: '#a9c1e0' },
                grid: { color: 'rgba(169, 193, 224, 0.1)' }
            },
            x: {
                ticks: { color: '#a9c1e0' },
                grid: { color: 'rgba(169, 193, 224, 0.1)' }
            }
        }
    };
    return (
        <div className="chart_container_doughnut"> {/* Reusing the same container style */}
            <Bar data={chartData} options={options} />
        </div>
    );
};


const Portfolio = () => {
  const [holdings, setHoldings] = useState([]);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
        try {
            const decoded = jwtDecode(token);
            setFirstName(decoded.firstName);
            setCurrentUserId(decoded._id);
        } catch (error) {
            console.error("Invalid token:", error);
            navigate("/login");
            return;
        }
    } else {
        navigate("/login");
        return;
    }

    const fetchPortfolioData = async () => {
        setIsLoading(true);
        try {
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const [holdingsRes, historyRes] = await Promise.all([
                axios.get("http://localhost:8080/api/portfolio/holdings", config),
                axios.get("http://localhost:8080/api/portfolio/history", config),
            ]);
            const initialHoldings = holdingsRes.data.map(h => ({
                ...h,
                currentPrice: h.averageBuyPrice, // Initial assumption
            }));
            setHoldings(initialHoldings);
            setHistory(historyRes.data);
        } catch (err) {
            console.error("Failed to fetch portfolio data:", err);
        } finally {
            setIsLoading(false);
        }
    };

    fetchPortfolioData();

    socket.on("orderExecuted", (orderData) => {
        if (orderData.user === currentUserId) fetchPortfolioData();
    });

    socket.on("ohlcWithBidAsk", (priceData) => {
        setHoldings(prev => prev.map(h =>
            h.symbol === priceData.symbol ? { ...h, currentPrice: priceData.ltp || priceData.close } : h
        ));
    });

    return () => {
        socket.off("orderExecuted");
        socket.off("ohlcWithBidAsk");
    };
  }, [currentUserId, navigate]);

  const summary = useMemo(() => {
      const totalInvestment = holdings.reduce((acc, h) => acc + (h.quantity * h.averageBuyPrice), 0);
      const currentValue = holdings.reduce((acc, h) => acc + (h.quantity * h.currentPrice), 0);
      return {
          totalInvestment,
          currentValue,
          profitLoss: currentValue - totalInvestment,
      };
  }, [holdings]);

  const handleLogout = () => {
      localStorage.removeItem("token");
      navigate("/login");
  };

  const holdingsCsvData = holdings.map(h => ({
      Symbol: h.symbol,
      Quantity: h.quantity,
      AvgBuyPrice: h.averageBuyPrice.toFixed(2),
      CurrentPrice: h.currentPrice.toFixed(2),
      ProfitLoss: ((h.currentPrice - h.averageBuyPrice) * h.quantity).toFixed(2)
  }));

  const historyCsvData = history.map(t => ({
      Date: new Date(t.timestamp).toLocaleString(),
      Symbol: t.symbol,
      Side: t.side,
      Quantity: t.quantity,
      Price: t.price.toFixed(2)
  }));

  if (isLoading) {
      return <div className="loading_container">Loading Portfolio...</div>;
  }

  return (
    <div className="portfolio_page_wrapper">
        <header className="portfolio_header">
            <div className="trade-title">📊 Tradify</div>
            <nav className="trade-nav">
                <Link to="/home">Home</Link>
                 <Link to="/stat">Market Stats</Link>
                <Link to="/wallet/balance">Wallet</Link>
                <Link to="/watchlist">Watchlist</Link>
                <Link to="/portfolio">Profile</Link>
                {firstName && <span className="welcome-message">Hi, {firstName} 👋</span>}
                <button onClick={handleLogout} className="logout-button">Logout</button>
            </nav>
        </header>

        <main className="portfolio_content">
            <div className="portfolio_summary_section">
                {/* --- Summary Cards --- */}
                <div className="summary_cards_container">
                    <div className="summary_card">
                        <h3>Total Investment</h3>
                        <p>₹{summary.totalInvestment.toFixed(2)}</p>
                    </div>
                    <div className="summary_card">
                        <h3>Current Value</h3>
                        <p>₹{summary.currentValue.toFixed(2)}</p>
                    </div>
                    <div className={`summary_card ${summary.profitLoss >= 0 ? "profit" : "loss"}`}>
                        <h3>Overall P/L</h3>
                        <p>₹{summary.profitLoss.toFixed(2)}</p>
                    </div>
                </div>

                {/* --- UPDATED: Charts Container --- */}
                {holdings.length > 0 && (
                    <div className="summary_charts_container">
                        <div className="summary_chart_container">
                             <h3>Investment Distribution</h3>
                            <HoldingsChart data={holdings} />
                        </div>
                        <div className="summary_chart_container">
                             <h3>Holding P/L</h3>
                            <ProfitLossChart data={holdings} />
                        </div>
                    </div>
                )}
            </div>

            {/* --- Holdings Section --- */}
            <div className="data_section">
                <div className="section_header">
                    <h2>Current Holdings</h2>
                    <CSVLink data={holdingsCsvData} filename={"current-holdings.csv"} className="export-button">Export CSV</CSVLink>
                </div>
                <div className="table_wrapper">
                    <table className="data_table">
                        <thead>
                            <tr><th>Symbol</th><th>Quantity</th><th>Avg. Buy Price</th><th>Current Price</th><th>P/L</th></tr>
                        </thead>
                        <tbody>
                            {holdings.length > 0 ? holdings.map((h) => {
                                const pl = (h.currentPrice - h.averageBuyPrice) * h.quantity;
                                return (
                                    <tr key={h.symbol}>
                                        <td>{h.symbol}</td>
                                        <td>{h.quantity}</td>
                                        <td>₹{h.averageBuyPrice.toFixed(2)}</td>
                                        <td>₹{h.currentPrice.toFixed(2)}</td>
                                        <td className={pl >= 0 ? 'profit-text' : 'loss-text'}>₹{pl.toFixed(2)}</td>
                                    </tr>
                                );
                            }) : (
                                <tr><td colSpan="5">You have no active holdings.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- History Section --- */}
            <div className="data_section">
                <div className="section_header">
                    <h2>Trade History</h2>
                    <CSVLink data={historyCsvData} filename={"trade-history.csv"} className="export-button">Export CSV</CSVLink>
                </div>
                <div className="table_wrapper">
                    <table className="data_table">
                        <thead>
                            <tr><th>Date</th><th>Symbol</th><th>Side</th><th>Quantity</th><th>Price</th></tr>
                        </thead>
                        <tbody>
                            {history.length > 0 ? history.map((t) => (
                                <tr key={t._id}>
                                    <td>{new Date(t.timestamp).toLocaleString()}</td>
                                    <td>{t.symbol}</td>
                                    <td className={`side-${t.side}`}>{t.side}</td>
                                    <td>{t.quantity}</td>
                                    <td>₹{t.price.toFixed(2)}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan="5">No trade history found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
    </div>
  );
};

export default Portfolio;