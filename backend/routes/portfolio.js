// routes/portfolio.js

const express = require("express");
const router = express.Router();
const BuyOrder = require("../models/BuyOrder");
const SellOrder = require("../models/SellOrder");
const authMiddleware = require("../middleware/auth"); // We'll create this simple middleware

// @route   GET api/portfolio/holdings
// @desc    Get all current user holdings (aggregated)
// @access  Private
router.get("/holdings", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    const executedBuys = await BuyOrder.find({ userId, status: "executed" });
    const executedSells = await SellOrder.find({ userId, status: "executed" });

    const holdingsMap = new Map();

    // Process all buys
    executedBuys.forEach(buy => {
      const { symbol, quantity, price } = buy;
      const existing = holdingsMap.get(symbol) || { quantity: 0, totalCost: 0 };
      existing.quantity += quantity;
      existing.totalCost += quantity * price;
      holdingsMap.set(symbol, existing);
    });

    // Process all sells
    executedSells.forEach(sell => {
      const { symbol, quantity } = sell;
      if (holdingsMap.has(symbol)) {
        holdingsMap.get(symbol).quantity -= quantity;
      }
    });

    // Calculate final holdings and average buy price
    const holdings = [];
    for (let [symbol, data] of holdingsMap.entries()) {
      if (data.quantity > 0) {
        holdings.push({
          symbol,
          quantity: data.quantity,
          // Calculate the average price paid for the shares currently held
          averageBuyPrice: data.totalCost / (data.quantity + executedSells.filter(s => s.symbol === symbol).reduce((acc, s) => acc + s.quantity, 0)),
        });
      }
    }

    res.json(holdings);

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   GET api/portfolio/history
// @desc    Get user's trade history
// @access  Private
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    const buys = await BuyOrder.find({ userId, status: "executed" }).lean();
    const sells = await SellOrder.find({ userId, status: "executed" }).lean();

    // Add a 'side' property to each object to distinguish them
    const history = [
        ...buys.map(b => ({ ...b, side: 'buy' })),
        ...sells.map(s => ({ ...s, side: 'sell' }))
    ];

    // Sort by most recent first
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(history);

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});


module.exports = router;