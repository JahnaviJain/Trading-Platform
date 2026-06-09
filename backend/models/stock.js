const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema({
  timestamp: Date,
  symbol: String,
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number,
});

module.exports = mongoose.model("Stock", stockSchema);