const crypto = require("crypto");
const Referral = require("../models/Referral");
const ReferralAttempt = require("../models/ReferralAttempt");
const ReferralSettings = require("../models/ReferralSettings");
const User = require("../models/User");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");

const addressHash = (address = {}) => {
  const value = [address.street, address.city, address.state, address.pincode]
    .map((part) => String(part || "").trim().toLowerCase()).join("|");
  return value.replaceAll("|", "") ? crypto.createHash("sha256").update(value).digest("hex") : "";
};

const getSettings = () => ReferralSettings.findOneAndUpdate(
  { key: "default" }, { $setOnInsert: { key: "default" } }, { new: true, upsert: true, setDefaultsOnInsert: true }
);

// Called only during registration, before the new customer is persisted.
const registerReferral = async ({ referralCode, email, phone, address, referredId }) => {
  if (!referralCode) return null;
  const normalizedCode = String(referralCode).trim().toUpperCase();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = String(phone || "").trim();
  const attemptedAddressHash = addressHash(address);
  const settings = await getSettings();
  const referrer = await User.findOne({ referralCode: normalizedCode });
  const log = async (outcome, reason, referrerId = null) => ReferralAttempt.create({
    referralCode: normalizedCode, referrerId, attemptedEmail: normalizedEmail, attemptedPhone: normalizedPhone,
    attemptedAddressHash, outcome, reason, referredId,
  });

  if (!settings.enabled || !referrer) {
    await log("Invalid", !settings.enabled ? "Referral program is disabled" : "Referral code does not exist");
    return null;
  }
  const referrerAddressHash = addressHash(referrer.address);
  let reason = "";
  if (referrer.email === normalizedEmail) reason = "Self-referral: matching email";
  else if (normalizedPhone && referrer.phone && normalizedPhone === referrer.phone) reason = "Self-referral: matching phone";
  else if (attemptedAddressHash && referrerAddressHash && attemptedAddressHash === referrerAddressHash) reason = "Self-referral: matching address";
  else if (await Referral.exists({ referredId })) reason = "Customer has already been referred";

  if (reason) {
    await log("Blocked", reason, referrer._id);
    return null;
  }
  await Referral.create({ referrerId: referrer._id, referredId, referralCode: normalizedCode });
  await log("Accepted", "", referrer._id);
  return referrer._id;
};

const getMyReferral = async (req, res, next) => {
  try {
    const referral = await Referral.find({ referrerId: req.user._id }).populate("referredId", "name email createdAt");
    const settings = await getSettings();
    res.json({
      referralCode: req.user.referralCode,
      referralLink: `${req.protocol}://${req.get("host")}/register?ref=${req.user.referralCode}`,
      rewardPoints: req.user.rewardPoints,
      settings: { refereeDiscountType: settings.refereeDiscountType, refereeDiscountValue: settings.refereeDiscountValue, referrerRewardPoints: settings.referrerRewardPoints },
      referrals: referral,
    });
  } catch (err) { next(err); }
};

const getAdminReferrals = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const referrals = await Referral.find(filter).populate("referrerId", "name email referralCode").populate("referredId", "name email phone address").populate("firstOrderId", "_id totalAmount originalAmount couponCode couponDiscount referralDiscount orderStatus createdAt deliveredAt").sort({ createdAt: -1 });
    const attempts = await ReferralAttempt.find({ outcome: { $ne: "Accepted" } }).populate("referrerId", "name email").sort({ createdAt: -1 }).limit(100);
    res.json({ referrals, blockedOrInvalidAttempts: attempts });
  } catch (err) { next(err); }
};

const getAdminReferralById = async (req, res, next) => {
  try {
    if (!require("mongoose").Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid referral ID" });
    const referral = await Referral.findById(req.params.id).populate("referrerId", "name email phone referralCode").populate("referredId", "name email phone address").populate("firstOrderId");
    if (!referral) return res.status(404).json({ message: "Referral not found" });
    const items = referral.firstOrderId ? await OrderItem.find({ orderId: referral.firstOrderId._id }) : [];
    res.json({ referral, order: referral.firstOrderId, orderItems: items });
  } catch (err) { next(err); }
};

const getReferralSettings = async (req, res, next) => {
  try { res.json(await getSettings()); } catch (err) { next(err); }
};

const updateReferralSettings = async (req, res, next) => {
  try {
    const allowed = ["enabled", "refereeDiscountType", "refereeDiscountValue", "referrerRewardPoints", "minimumOrderAmount"];
    const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    if (update.refereeDiscountType && !["percentage", "fixed"].includes(update.refereeDiscountType)) return res.status(400).json({ message: "Invalid referee discount type" });
    for (const key of ["refereeDiscountValue", "referrerRewardPoints", "minimumOrderAmount"]) {
      if (update[key] !== undefined && (typeof update[key] !== "number" || update[key] < 0)) return res.status(400).json({ message: `${key} must be a non-negative number` });
    }
    if (update.enabled !== undefined && typeof update.enabled !== "boolean") return res.status(400).json({ message: "enabled must be a boolean" });
    const settings = await ReferralSettings.findOneAndUpdate({ key: "default" }, { $set: update, $setOnInsert: { key: "default" } }, { new: true, upsert: true, runValidators: true });
    res.json(settings);
  } catch (err) { next(err); }
};

module.exports = { addressHash, getSettings, registerReferral, getMyReferral, getAdminReferrals, getAdminReferralById, getReferralSettings, updateReferralSettings };
