const mongoose = require("mongoose");

const priceSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  buyPrice: Number,
  sellPrice: Number,
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Price", priceSchema);
