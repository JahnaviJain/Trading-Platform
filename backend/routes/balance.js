const express = require("express");
const router = express.Router();
const Balance = require("../models/balance");
const auth = require("../middleware/auth");

// Get balance
router.get("/", auth, async (req, res) => {
  try {
    const balance = await Balance.findOne({ userId: req.user._id });
    res.json(balance || { amount: 0 });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Add/Update balance
router.post("/add", auth, async (req, res) => {
  try {
    const { amount } = req.body;

    let balance = await Balance.findOne({ userId: req.user._id });

    if (balance) {
      balance.amount += parseFloat(amount);
    } else {
      balance = new Balance({
        userId: req.user._id,
        amount: parseFloat(amount),
      });
    }

    await balance.save();
    res.json({ message: "Balance updated", balance });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


router.post("/withdraw", auth, async (req, res) => {
  try {
    const { amount } = req.body;

    let balance = await Balance.findOne({ userId: req.user._id });

    if (!balance) {
      return res.status(400).json({ message: "No balance record found" });
    }

    const withdrawAmount = parseFloat(amount);
    if (withdrawAmount <= 0) {
      return res.status(400).json({ message: "Invalid withdrawal amount" });
    }

    if (balance.amount < withdrawAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    balance.amount -= withdrawAmount;
    await balance.save();

    res.json({ message: "Withdrawal successful", balance });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
