const mongoose = require("mongoose");

const referralSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "default" },
  enabled: { type: Boolean, default: true },
  refereeDiscountType: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
  refereeDiscountValue: { type: Number, default: 10, min: 0 },
  referrerRewardPoints: { type: Number, default: 100, min: 0 },
  minimumOrderAmount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model("ReferralSettings", referralSettingsSchema);
