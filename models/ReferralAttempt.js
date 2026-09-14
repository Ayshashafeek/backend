const mongoose = require("mongoose");

const referralAttemptSchema = new mongoose.Schema({
  referralCode: { type: String, trim: true, uppercase: true },
  referrerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  attemptedEmail: { type: String, trim: true, lowercase: true },
  attemptedPhone: { type: String, trim: true, default: "" },
  attemptedAddressHash: { type: String, default: "" },
  outcome: { type: String, enum: ["Accepted", "Blocked", "Invalid"], required: true },
  reason: { type: String, default: "" },
  referredId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

module.exports = mongoose.model("ReferralAttempt", referralAttemptSchema);
