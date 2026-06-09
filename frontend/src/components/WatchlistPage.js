// src/components/WatchlistPage.js (REPLACE ENTIRE FILE)

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import { jwtDecode } from "jwt-decode";
import { Sparklines, SparklinesLine } from 'react-sparklines';
import "./Watchlist.css"; 

const socket = io("http://localhost:8080");

const WatchlistPage = () => {
    const [stockDetails, setStockDetails] = useState([]);
    const [livePrices, setLivePrices] = useState({});
    const [firstName, setFirstName] = useState("");
    const navigate = useNavigate();

    const fetchWatchlistData = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;

            const { data: symbols } = await axios.get("http://localhost:8080/api/watchlist", {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (symbols.length === 0) {
                setStockDetails([]);
                return;
            }

            const { data: details } = await axios.post("http://localhost:8080/api/stocks/bulk-details", 
                { symbols },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setStockDetails(details);
        } catch (error) {
            console.error("Failed to fetch watchlist data", error);
            setStockDetails([]); 
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (token) {
            try {
                setFirstName(jwtDecode(token).firstName);
                fetchWatchlistData();
            } catch (error) {
                console.error("Invalid token:", error);
                handleLogout(); 
            }
        }

        socket.on("ohlcWithBidAsk", (update) => {
            setLivePrices(prev => ({
                ...prev,
                [update.symbol]: update,
            }));
        });

        return () => socket.off("ohlcWithBidAsk");
    }, [fetchWatchlistData]);

    const handleRemove = async (symbol) => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;

            await axios.post(
                `http://localhost:8080/api/watchlist/remove`,
                { symbol }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );

            fetchWatchlistData();
        } catch (error) {
            console.error("Failed to remove stock from watchlist:", error);
        }
    };
    
    const handleLogout = () => {
        localStorage.removeItem("token");
        navigate("/login");
    };

    // FIX #1: Make the calculateChange function more robust.
    // It now checks if the inputs are valid numbers before doing calculations.
    const calculateChange = (current, open) => {
        if (typeof current !== 'number' || typeof open !== 'number' || open === 0) {
            return { value: '0.00', percent: '0.00' };
        }
        const valueChange = current - open;
        const percentChange = (valueChange / open) * 100;
        return { value: valueChange.toFixed(2), percent: percentChange.toFixed(2) };
    };

    // FIX #2: Ensure getBestPrice always returns a number.
    const getBestPrice = (symbol) => {
        const livePrice = livePrices[symbol]?.ltp;
        if (typeof livePrice === 'number') {
            return livePrice;
        }
        // Fallback to the initial data from the bulk-details call
        const initialPrice = stockDetails.find(s => s.symbol === symbol)?.price;
        if (typeof initialPrice === 'number') {
            return initialPrice;
        }
        return 0; // The ultimate fallback to prevent errors
    }

    return (
        <div className="trade-container">
            <header className="trade-header">
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
            
            <main className="watchlist-main">
                <h2>My Watchlist</h2>
                <div className="watchlist-table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Company</th>
                                <th>Live Price</th>
                                <th>Change</th>
                                <th>Day High</th>
                                <th>Day Low</th>
                                <th>Weekly Trend</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stockDetails.length > 0 ? stockDetails.map(stock => {
                                const currentPrice = getBestPrice(stock.symbol);
                                const openPrice = livePrices[stock.symbol]?.open ?? stock.open;
                                const change = calculateChange(currentPrice, openPrice);
                                const isUp = parseFloat(change.value) >= 0;

                                return (
                                    <tr key={stock.symbol}>
                                        <td>
                                            <div className="company-info">
                                                <span className="company-symbol">{stock.symbol}</span>
                                                <span className="company-name">{stock.name}</span>
                                            </div>
                                        </td>
                                        <td className={`price ${isUp ? 'up' : 'down'}`}>
                                            ${currentPrice.toFixed(2)}
                                        </td>
                                        <td className={isUp ? 'up' : 'down'}>
                                            <div className="change-info">
                                                <span>{isUp ? '▲' : '▼'} {Math.abs(change.percent)}%</span>
                                                <small>${Math.abs(change.value)}</small>
                                            </div>
                                        </td>
                                        {/* FIX #3: Safely render high and low prices */}
                                        <td>{typeof livePrices[stock.symbol]?.high === 'number' ? `$${livePrices[stock.symbol].high.toFixed(2)}` : '-'}</td>
                                        <td>{typeof livePrices[stock.symbol]?.low === 'number' ? `$${livePrices[stock.symbol].low.toFixed(2)}` : '-'}</td>
                                        <td className="sparkline-cell">
                                            {stock.weeklyPrices && stock.weeklyPrices.length > 1 && (
                                                <Sparklines data={stock.weeklyPrices} width={120} height={40}>
                                                    <SparklinesLine color={isUp ? "#00D09C" : "#F44336"} style={{ fill: "none", strokeWidth: 2 }} />
                                                </Sparklines>
                                            )}
                                        </td>
                                        <td>
                                            <button className="remove-btn" onClick={() => handleRemove(stock.symbol)}>
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan="7" className="empty-watchlist">
                                        Your watchlist is empty
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
};

export default WatchlistPage;