const express = require("express");
const router = express.Router();
const { Bid, Ask } = require("../models/order");
const { User } = require("../models/user");
const auth = require("../middleware/auth");

// Place Limit Order (Protected)
router.post("/order", auth, async (req, res) => {
  try {
    const { side, price, quantity, ticker } = req.body;
    if (!["bid", "ask"].includes(side) || !price || !quantity || !ticker) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const userId = req.user._id;
    const remainingQty = await fillOrders(side, price, quantity, userId, ticker);

    if (remainingQty === 0)
      return res.json({ filledQuantity: quantity });

    const OrderModel = side === "bid" ? Bid : Ask;
    const order = new OrderModel({ userId, price, quantity: remainingQty, ticker });
    await order.save();

    res.json({ filledQuantity: quantity - remainingQty });
  } catch (err) {
    res.status(500).json({ message: "Order placement failed", error: err.message });
  }
});

// Market Depth (Protected)
router.get("/depth", auth, async (req, res) => {
  try {
    const { ticker } = req.query;
    if (!ticker) return res.status(400).json({ message: "Ticker required" });

    const depth = {};
    const bids = await Bid.find({ ticker }).sort({ price: -1 });
    const asks = await Ask.find({ ticker }).sort({ price: 1 });

    bids.forEach(b => {
      depth[b.price] = depth[b.price] || { quantity: 0, type: "bid" };
      depth[b.price].quantity += b.quantity;
    });

    asks.forEach(a => {
      depth[a.price] = depth[a.price] || { quantity: 0, type: "ask" };
      depth[a.price].quantity += a.quantity;
    });

    res.json({ depth });
  } catch (err) {
    res.status(500).json({ message: "Depth fetch failed", error: err.message });
  }
});

// Get Quote (Protected)
router.post("/quote", auth, async (req, res) => {
  try {
    const { side, quantity, ticker } = req.body;
    if (!["bid", "ask"].includes(side) || !quantity || !ticker) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const quote = await getQuote(side, quantity, req.user._id, ticker);
    res.json({ quote });
  } catch (err) {
    res.status(500).json({ message: "Quote generation failed", error: err.message });
  }
});

module.exports = router;

// --- Helper Functions ---

const getQuote = async (side, quantity, userId, ticker) => {
  let quote = 0, curQty = quantity;

  const orders = side === "bid"
    ? await Ask.find({ ticker }).sort({ price: 1 })
    : await Bid.find({ ticker }).sort({ price: -1 });

  for (const order of orders) {
    if (order.userId.toString() === userId.toString()) continue;

    if (order.quantity >= curQty) {
      quote += curQty * order.price;
      break;
    } else {
      quote += order.quantity * order.price;
      curQty -= order.quantity;
    }
  }

  return quote;
};

const flipBalance = async (sellerId, buyerId, qty, price, ticker) => {
  const seller = await User.findById(sellerId);
  const buyer = await User.findById(buyerId);
  const total = qty * price;

  if ((seller.balances.get(ticker) || 0) < qty || (buyer.balances.get("INR") || 0) < total)
    throw new Error("Insufficient balances");

  seller.balances.set(ticker, seller.balances.get(ticker) - qty);
  buyer.balances.set(ticker, (buyer.balances.get(ticker) || 0) + qty);

  seller.balances.set("INR", (seller.balances.get("INR") || 0) + total);
  buyer.balances.set("INR", buyer.balances.get("INR") - total);

  await seller.save();
  await buyer.save();
};

const fillOrders = async (side, price, quantity, userId, ticker) => {
  let remaining = quantity;

  const orders = side === "bid"
    ? await Ask.find({ ticker }).sort({ price: 1 })
    : await Bid.find({ ticker }).sort({ price: -1 });

  for (const order of orders) {
    if ((side === "bid" && order.price > price) || (side === "ask" && order.price < price)) continue;

    const tradeQty = Math.min(order.quantity, remaining);

    if (side === "bid") {
      await flipBalance(order.userId, userId, tradeQty, order.price, ticker);
    } else {
      await flipBalance(userId, order.userId, tradeQty, order.price, ticker);
    }

    remaining -= tradeQty;
    if (order.quantity > tradeQty) {
      order.quantity -= tradeQty;
      await order.save();
    } else {
      await order.deleteOne();
    }

    if (remaining === 0) break;
  }

  return remaining;
};
