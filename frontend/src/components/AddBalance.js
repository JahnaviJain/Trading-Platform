import { Link } from "react-router-dom";
import "./Balance.css";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { useNavigate } from "react-router-dom";
const AddBalancePage = () => {
  const [amount, setAmount] = useState(0);
  const [balances, setBalances] = useState(0);
   const navigate = useNavigate();
   const [firstName, setFirstName] = useState("");

  const fetchBalances = async () => {
    try {
      const res = await axios.get("http://localhost:8080/api/balance", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      setBalances(res.data.amount);
    } catch (err) {
      console.error("Error fetching balances:", err);
    }
  };

  const handleAddBalance = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        "http://localhost:8080/api/balance/add",
        { amount: Number(amount) },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      alert("Balance added successfully");
      fetchBalances();
      setAmount(0);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to add balance");
    }
  };

  const handleWithdrawBalance = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        "http://localhost:8080/api/balance/withdraw",
        { amount: Number(amount) },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      alert("Withdrawal successful");
      fetchBalances();
      setAmount(0);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to withdraw balance");
    }
  };

  useEffect(() => {
    
          const token = localStorage.getItem("token");
      if (token) {
        const decoded = jwtDecode(token);
        console.log("Decoded Token:", decoded);
        setFirstName(decoded.firstName);
      }
    
    fetchBalances();
  }, []);

    const handleLogout = () => {
  localStorage.removeItem("token"); // Clear the auth token
  navigate("/login"); // Redirect to login page
};

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <div className="title">Tradify</div>
        <nav className="nav">
          <Link to="/home">Home</Link>
          <Link to="/stat">Market Stats</Link>
          <Link to="/wallet/balance">Wallet</Link>
          <Link to="/watchlist">Watchlist</Link>
          <Link to="/portfolio">Portfolio</Link>
          {firstName && <span className="welcome-message">Hi, {firstName} 👋</span>}
            <button onClick={handleLogout} className="logout-button">Logout</button>
         
        </nav>
      </header>

      {/* Main */}
      <main className="main">
        <h2 className="main-title">Manage Balance</h2>

        <div className="balance-box">
          <div className="balance-display">
            <strong>Your Balance:</strong> ${balances}
          </div>

          <form className="balance-form">
            <label htmlFor="amount">Amount ($):</label>
            <input
              type="number"
              id="amount"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <div className="button-group">
              <button onClick={handleAddBalance} className="follow-btn">
                Add Balance
              </button>
              <button onClick={handleWithdrawBalance} className="follow-btn withdraw-btn">
                Withdraw Balance
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        &copy; {new Date().getFullYear()} Trade Platform. All rights reserved.
      </footer>
    </div>
  );
};

export default AddBalancePage;
