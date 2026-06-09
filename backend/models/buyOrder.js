const mongoose = require("mongoose");

const BuyOrderSchema = new mongoose.Schema({
   userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Assuming your user model is named "User"
      required: true,
     
    },
  symbol: String,
  type: String, // 'market' or 'limit'
  quantity: Number,
  price: Number,
  status: String, // 'executed' or 'pending'
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("BuyOrder", BuyOrderSchema);
