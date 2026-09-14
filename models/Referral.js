const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema({
  referrerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  referredId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  referralCode: { type: String, required: true, uppercase: true, trim: true },
  status: { type: String, enum: ["Pending", "Completed", "Cancelled"], default: "Pending" },
  firstOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  refereeDiscountAmount: { type: Number, default: 0, min: 0 },
  referrerRewardPoints: { type: Number, default: 0, min: 0 },
  rewardGivenAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Referral", referralSchema);
