// const mongoose = require("mongoose");

// const orderSchema = new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
//   price: { type: Number, required: true },
//   quantity: { type: Number, required: true },
//   ticker: { type: String, required: true },
// });

// const Bid = mongoose.model("Bid", orderSchema);
// const Ask = mongoose.model("Ask", orderSchema);

// module.exports = { Bid, Ask };
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  symbol: String,
  type: { type: String, enum: ["market", "limit"], required: true },
  side: { type: String, enum: ["buy", "sell"], required: true },
  quantity: Number,
  price: Number, // For limit orders
  status: { type: String, enum: ["pending", "executed", "cancelled"], default: "pending" },
  executedPrice: Number,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Order", orderSchema);
