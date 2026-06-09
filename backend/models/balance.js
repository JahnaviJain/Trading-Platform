const mongoose = require("mongoose");

const balanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Assuming your user model is named "User"
    required: true,
    unique: true,
  },
  amount: {
    type: Number,
    required: true,
    default: 0,
  },
});

module.exports = mongoose.model("Balance", balanceSchema);
