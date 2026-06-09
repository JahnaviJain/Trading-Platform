import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import "./OrderExecutionUI.css";
import { useParams } from "react-router-dom";
import { jwtDecode } from "jwt-decode";



const socket = io("http://localhost:8080"); // Adjust if needed


const OrderExecutionUI = () => {
  const [type, setType] = useState("market");
  const [side, setSide] = useState("buy");
  const [quantity, setQuantity] = useState(1);
  const [entryPrice, setEntryPrice] = useState(219);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLossStrategy, setStopLossStrategy] = useState("manual");
  const [takeProfitStrategy, setTakeProfitStrategy] = useState("manual");
  const { symbol } = useParams();
   const timeoutRef = useRef(null); 
//  const [firstName, setFirstName] = useState("");
 const [bidPrice, setBidPrice] = useState(null);
const [askPrice, setAskPrice] = useState(null);




  // At top of your component
const [ohlc, setOHLC] = useState({
  open: null,
  high: null,
  low: null,
  close: null,
  timestamp:"",
});

  const [orderStatus, setOrderStatus] = useState("");

const token = localStorage.getItem("token");
let userId = null;
if (token) {
  const decoded = jwtDecode(token);
  userId = decoded._id;  }


useEffect(() => {
  if (type === "limit") {
    if (side === "buy") {
      if (askPrice) setEntryPrice(askPrice);  // For buy limit orders, default entry price = current ask
    } else if (side === "sell") {
      if (bidPrice) setEntryPrice(bidPrice);  // For sell limit orders, default entry price = current bid
    }
  }
}, [type, side, bidPrice, askPrice]);



// In OrderExecutionUI.js
useEffect(() => {
  // *** ADD THIS LINE ***
  // Request initial data for the current symbol when the component loads
  if (symbol) {
    socket.emit("getSymbolData", symbol);
  }

  // This handler will process both the initial data and subsequent updates
  const handleOhlcWithBidAsk = (data) => {
    const { symbol: updatedSymbol, open, high, low, close, timestamp, bidPrice, askPrice } = data;
    if (updatedSymbol === symbol) {
      setOHLC({ open, high, low, close, timestamp });
      setBidPrice(bidPrice);
      setAskPrice(askPrice);

      // You can also consider setting the initial limit price here
      if (side === "buy" && askPrice) {
        setEntryPrice(askPrice);
      } else if (side === "sell" && bidPrice) {
        setEntryPrice(bidPrice);
      }
    }
  };

  socket.on("ohlcWithBidAsk", handleOhlcWithBidAsk);

  return () => {
    socket.off("ohlcWithBidAsk", handleOhlcWithBidAsk);
  };
}, [symbol]); // Keep the dependency array as [symbol]




  const handlePlaceOrder = async () => {
    try {
      const url = `http://localhost:8080/api/orders/${side}`;
      const payload = {
        userId,
        symbol: symbol,
        type,
        quantity,
        price: type === "limit" ? entryPrice : null,
      };

      const response = await axios.post(url, payload);
      setOrderStatus(`✅ ${side.toUpperCase()} order ${response.data.order.status.toUpperCase()} at $${response.data.order.price}`);
    } catch (error) {
      // --- THIS IS THE UPDATED PART ---
      // Check if the error response has a specific message from our backend
      if (error.response && error.response.data && error.response.data.message) {
        // Display the specific error message from the server (e.g., "Insufficient funds")
        setOrderStatus(`❌ ${error.response.data.message}`);
      } else {
        // Fallback to a generic message if the error is unexpected
        setOrderStatus("❌ Order failed. Please try again.");
      }
      console.error("Order placement error:", error.response || error);
      // --- END OF UPDATE ---
    }


    timeoutRef.current = setTimeout(() => {
    setOrderStatus("");
  }, 3000); 
  };

  const calculatedStopLoss = () => {
    const entry = Number(entryPrice);
    switch (stopLossStrategy) {
      case "percent_2":
        return (entry * 0.98).toFixed(2);
      case "fixed_loss":
        return (entry - 100 / quantity).toFixed(2);
      case "manual":
      default:
        return stopLoss;
    }
  };

  const calculatedTakeProfit = () => {
    const entry = Number(entryPrice);
    const stop = parseFloat(calculatedStopLoss());
    switch (takeProfitStrategy) {
      case "rr_2":
        const risk = Math.abs(entry - stop);
        return (entry + risk * 2).toFixed(2);
      case "fixed_target":
        return (entry + 200 / quantity).toFixed(2);
      case "manual":
      default:
        return takeProfit;
    }
  };

  const calcMaxLoss = () => {
    const sl = parseFloat(calculatedStopLoss());
    return (Math.abs(entryPrice - sl) * quantity) || null;
  };

  const calcMaxGain = () => {
    const tp = parseFloat(calculatedTakeProfit());
    return (Math.abs(tp - entryPrice) * quantity) || null;
  };

  const calcRiskReward = () => {
    const loss = calcMaxLoss();
    const gain = calcMaxGain();
    if (!loss || !gain) return null;
    return (gain / loss).toFixed(2);
  };

  return (
    <div className="order-container web">
      <h2>📈 Order Execution Panel</h2>

      <div className="stock-info">
        <p><strong>Symbol:</strong> {symbol}</p>
     {ohlc.open != null && ohlc.high != null && ohlc.low != null && ohlc.close != null ? (
  <p>📊 OHLC: {ohlc.open} / {ohlc.high} / {ohlc.low} / {ohlc.close}</p>
) : (
  <p style={{ color: "gray" }}>📊 OHLC: Loading...</p>
)}

      <p>💵 Bid Price: {bidPrice != null ? `$${bidPrice}` : "Loading..."}</p>
<p>💰 Ask Price: {askPrice != null ? `$${askPrice}` : "Loading..."}</p>
 {/* *** ADD THIS PARAGRAPH *** */}
  <p>↔️ Spread: ${(askPrice - bidPrice).toFixed(2)}</p>

      </div>

      <div className="form-grid web-grid">
        {/* Order Inputs (same as before) */}
        <div className="form-group">
          <label>Order Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
        </div>

        <div className="form-group">
          <label>Side</label>
          <select value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>

        <div className="form-group">
          <label>Quantity</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </div>

        {type === "limit" && (
          <div className="form-group">
            <label>Entry Price</label>
            <input
              type="number"
              value={entryPrice}
              onChange={(e) => setEntryPrice(Number(e.target.value))}
            />
          </div>
        )}

        <div className="form-group">
          <label>Stop Loss Strategy</label>
          <select value={stopLossStrategy} onChange={(e) => setStopLossStrategy(e.target.value)}>
            <option value="manual">Manual</option>
            <option value="percent_2">2% Below Entry</option>
            <option value="fixed_loss">Fixed $100 Max Loss</option>
          </select>
          {stopLossStrategy === "manual" ? (
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(Number(e.target.value))}
              placeholder="Enter stop loss"
            />
          ) : (
            <p className="auto-stop">Auto Stop Loss: ${calculatedStopLoss()}</p>
          )}
        </div>

        <div className="form-group">
          <label>Take Profit Strategy</label>
          <select value={takeProfitStrategy} onChange={(e) => setTakeProfitStrategy(e.target.value)}>
            <option value="manual">Manual</option>
            <option value="rr_2">2:1 Risk:Reward</option>
            <option value="fixed_target">$200 Target</option>
          </select>
          {takeProfitStrategy === "manual" ? (
            <input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(Number(e.target.value))}
              placeholder="Enter take profit"
            />
          ) : (
            <p className="auto-stop">Auto Take Profit: ${calculatedTakeProfit()}</p>
          )}
        </div>
      </div>

      {(calcMaxLoss() || calcMaxGain()) && (
        <div className="risk-box">
          <h4>🛡️ Risk Assessment</h4>
          <p>Max Loss: <strong>${calcMaxLoss()?.toFixed(2)}</strong></p>
          <p>Max Gain: <strong>${calcMaxGain()?.toFixed(2)}</strong></p>
          {calcRiskReward() && <p>Risk:Reward = <strong>{calcRiskReward()} : 1</strong></p>}
        </div>
      )}

      <button className="submit-button" onClick={handlePlaceOrder}>
        🚀 Place {side.toUpperCase()} {type.toUpperCase()} Order
      </button>

      {orderStatus && <p className="order-status">{orderStatus}</p>}
    </div>
  );
};

export default OrderExecutionUI;