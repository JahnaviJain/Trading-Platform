const express = require("express");
const Order = require("../models/order");
const BuyOrder = require("../models/BuyOrder");
const SellOrder = require("../models/SellOrder");
const Price = require("../models/priceSchema");
const Stock = require("../models/stock"); // Import Stock model for OHLC
const priceStore = require("../priceStore");
const Balance = require("../models/balance"); 

module.exports = function (io) {
  const router = express.Router();

  // Helper function to emit unified price update
  const emitPriceUpdate = (symbol) => {
    const symbolData = priceStore[symbol];
    if (symbolData) {
      io.emit("ohlcWithBidAsk", {
        symbol,
        open: symbolData.open,
        high: symbolData.high,
        low: symbolData.low,
        close: symbolData.close,
        bidPrice: symbolData.bidPrice,
        askPrice: symbolData.askPrice,
        timestamp: new Date().toISOString(),
        ltp: symbolData.ltp || symbolData.close,
      });
    }
  };

  // GET latest OHLC data for a symbol
  router.get("/ohlc/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const latestOhlc = await Stock.findOne({ symbol }).sort({ timestamp: -1 });
      if (!latestOhlc) {
        return res.status(404).json({ error: "No OHLC data found for " + symbol });
      }
      res.json({
        symbol: latestOhlc.symbol,
        open: latestOhlc.open,
        high: latestOhlc.high,
        low: latestOhlc.low,
        close: latestOhlc.close,
        timestamp: latestOhlc.timestamp,
      });
    } catch (error) {
      console.error("Error fetching OHLC data:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET latest bid/ask prices for a symbol (updated to use new structure)
  router.get("/latest/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      
      // First try to get from priceStore (live data)
      if (priceStore[symbol]) {
        return res.json({
          symbol,
          bidPrice: priceStore[symbol].bidPrice,
          askPrice: priceStore[symbol].askPrice,
          spread: priceStore[symbol].spread,
          ltp: priceStore[symbol].ltp,
          updatedAt: new Date(),
        });
      }

      // Fallback to database
      const price = await Price.findOne({ symbol }).sort({ updatedAt: -1 });
      if (!price) {
        return res.status(404).json({ error: "No price found" });
      }
      
      res.json({
        symbol: price.symbol,
        bidPrice: price.bidPrice || price.buyPrice, // Support legacy field
        askPrice: price.askPrice || price.sellPrice, // Support legacy field
        buyPrice: price.buyPrice, // Keep for backward compatibility
        sellPrice: price.sellPrice, // Keep for backward compatibility
        updatedAt: price.updatedAt,
      });
    } catch (error) {
      console.error("Error fetching latest prices:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PLACE ORDER (general endpoint)
  router.post("/place", async (req, res) => {
    const { symbol, type, side, quantity, price } = req.body;
    const order = new Order({ symbol, type, side, quantity, price: type === "limit" ? price : null });
    await order.save();
    res.status(200).json({ message: "Order placed", order });
  });

  // BUY order
  router.post("/buy", async (req, res) => {
    try {
      const { userId, symbol, type, quantity, price } = req.body;

        // Crucial: Ensure we have a user to check balance for
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated." });
      }

      const symbolData = priceStore[symbol];
      if (!symbolData) {
        return res.status(400).json({ error: "Invalid stock symbol or no price data available" });
      }

      const currentPrice = symbolData.close || symbolData.ltp;
      let executionPrice;
      let status;

      if (type === "market") {
        // Market buy executes at the ask price (you pay the ask)
        executionPrice = symbolData.askPrice || currentPrice;
        status = "executed";
      } else if (type === "limit") {
        executionPrice = price;
        // Buy limit order executes only if limit price is >= ask (seller's price)
        const askPrice = symbolData.askPrice || currentPrice;
        if (price >= askPrice) {
          status = "executed";
        } else {
          status = "pending";
        }
      } else {
        return res.status(400).json({ error: "Invalid order type" });
      }

         // --- BALANCE CHECK AND UPDATE LOGIC (FOR EXECUTED ORDERS) ---
      if (status === "executed") {
        const totalCost = executionPrice * quantity;
        const userBalance = await Balance.findOne({ userId });

        if (!userBalance || userBalance.amount < totalCost) {
          return res.status(400).json({ message: "Insufficient funds to place this order." });
        }

        // If funds are sufficient, deduct the balance
        userBalance.amount -= totalCost;
        await userBalance.save();
      }
      // --- END OF BALANCE LOGIC ---

      const newOrder = new BuyOrder({
        userId,
        symbol,
        type,
        quantity,
        price: executionPrice,
        status,
      });

      await newOrder.save();

      if (status === "executed") {
        // Update priceStore - for executed buy orders, this might affect the bid
        // In a real system, this would depend on your market making logic
        priceStore[symbol] = {
          ...priceStore[symbol],
          buyPrice: executionPrice, // Keep for backward compatibility
          lastTradePrice: executionPrice,
        };

        // Update database with both new and legacy fields
        await Price.findOneAndUpdate(
          { symbol },
          {
            $set: {
              buyPrice: executionPrice, // Legacy field
              bidPrice: priceStore[symbol].bidPrice, // Current bid
              askPrice: priceStore[symbol].askPrice, // Current ask
              lastTradePrice: executionPrice,
              updatedAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );

        // Emit unified price update
        emitPriceUpdate(symbol);

        // Also emit order execution event
        io.emit("orderExecuted", {
          orderId: newOrder._id,
          symbol,
          type: "buy",
          executionPrice,
          quantity,
          userId,
          timestamp: new Date().toISOString(),
        });
      }

      res.status(201).json({ 
        message: "Buy Order Processed", 
        order: newOrder,
        status,
        executionPrice: status === "executed" ? executionPrice : null 
      });
    } catch (error) {
      console.error("Error processing buy order:", error);
      // More specific error for frontend
      if (error.message.includes("Insufficient funds")) {
          return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // SELL order
  router.post("/sell", async (req, res) => {
    try {
      const { userId, symbol, type, quantity, price } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated." });
      }

      const symbolData = priceStore[symbol];
      if (!symbolData) {
        return res.status(400).json({ error: "Invalid stock symbol or no price data available" });
      }

      const currentPrice = symbolData.close || symbolData.ltp;
      let executionPrice;
      let status;

      if (type === "market") {
        // Market sell executes at the bid price (you receive the bid)
        executionPrice = symbolData.bidPrice || currentPrice;
        status = "executed";
      } else if (type === "limit") {
        executionPrice = price;
        // Sell limit order executes if limit price <= bid (buyer willing to pay)
        const bidPrice = symbolData.bidPrice || currentPrice;
        if (price <= bidPrice) {
          status = "executed";
        } else {
          status = "pending";
        }
      } else {
        return res.status(400).json({ error: "Invalid order type" });
      }

      // --- BALANCE UPDATE LOGIC (FOR EXECUTED ORDERS) ---
      if (status === "executed") {
        const totalProceeds = executionPrice * quantity;
        // Use findOneAndUpdate with $inc for an atomic operation
        await Balance.findOneAndUpdate(
          { userId },
          { $inc: { amount: totalProceeds } },
          { upsert: true, new: true } // Creates balance doc if it doesn't exist
        );
      }
      // --- END OF BALANCE LOGIC ---

      const newOrder = new SellOrder({
        userId,
        symbol,
        type,
        quantity,
        price: executionPrice,
        status,
      });

      await newOrder.save();

      if (status === "executed") {
        // Update priceStore - for executed sell orders, this might affect the ask
        // In a real system, this would depend on your market making logic
        priceStore[symbol] = {
          ...priceStore[symbol],
          sellPrice: executionPrice, // Keep for backward compatibility
          lastTradePrice: executionPrice,
        };

        // Update database with both new and legacy fields
        await Price.findOneAndUpdate(
          { symbol },
          {
            $set: {
              sellPrice: executionPrice, // Legacy field
              bidPrice: priceStore[symbol].bidPrice, // Current bid
              askPrice: priceStore[symbol].askPrice, // Current ask
              lastTradePrice: executionPrice,
              updatedAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );

        // Emit unified price update
        emitPriceUpdate(symbol);

        // Also emit order execution event
        io.emit("orderExecuted", {
          orderId: newOrder._id,
          symbol,
          type: "sell",
          executionPrice,
          quantity,
          userId,
          timestamp: new Date().toISOString(),
        });
      }

      res.status(201).json({ 
        message: "Sell Order Processed", 
        order: newOrder,
        status,
        executionPrice: status === "executed" ? executionPrice : null 
      });
    } catch (error) {
      console.error("Error processing sell order:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};