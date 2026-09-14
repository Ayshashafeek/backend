const mongoose = require("mongoose");
const Coupon = require("../models/Coupon");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Admin/Super Admin: Get all coupons
const getCoupons = async (req, res, next) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ coupons });
  } catch (err) {
    next(err);
  }
};

// Admin/Super Admin: Get single coupon
const getCouponById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid coupon ID" });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    res.json(coupon);
  } catch (err) {
    next(err);
  }
};

// Admin/Super Admin: Create coupon
const createCoupon = async (req, res, next) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      validFrom,
      validUntil,
      usageLimit,
    } = req.body;

    if (!code || discountValue === undefined) {
      return res.status(400).json({ message: "Coupon code and discount value are required" });
    }

    const normalizedCode = code.toUpperCase().trim();
    const existing = await Coupon.findOne({ code: normalizedCode });
    if (existing) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    if (discountType && !["percentage", "fixed"].includes(discountType)) {
      return res.status(400).json({ message: "Discount type must be 'percentage' or 'fixed'" });
    }

    if (discountType === "percentage" && (discountValue <= 0 || discountValue > 100)) {
      return res.status(400).json({ message: "Percentage discount must be between 1 and 100" });
    }

    const coupon = await Coupon.create({
      code: normalizedCode,
      discountType: discountType || "percentage",
      discountValue: Number(discountValue),
      minOrderAmount: minOrderAmount !== undefined ? Number(minOrderAmount) : 0,
      maxDiscount: maxDiscount !== undefined ? Number(maxDiscount) : null,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : null,
      usageLimit: usageLimit !== undefined ? Number(usageLimit) : null,
    });

    res.status(201).json({ message: "Coupon created successfully", coupon });
  } catch (err) {
    next(err);
  }
};

// Admin/Super Admin: Update coupon
const updateCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid coupon ID" });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    const {
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      validUntil,
      usageLimit,
      isActive,
    } = req.body;

    if (discountType !== undefined) {
      if (!["percentage", "fixed"].includes(discountType)) {
        return res.status(400).json({ message: "Discount type must be 'percentage' or 'fixed'" });
      }
      coupon.discountType = discountType;
    }

    if (discountValue !== undefined) {
      if (coupon.discountType === "percentage" && (discountValue <= 0 || discountValue > 100)) {
        return res.status(400).json({ message: "Percentage discount must be between 1 and 100" });
      }
      coupon.discountValue = Number(discountValue);
    }

    if (minOrderAmount !== undefined) coupon.minOrderAmount = Number(minOrderAmount);
    if (maxDiscount !== undefined) coupon.maxDiscount = Number(maxDiscount);
    if (validUntil !== undefined) coupon.validUntil = validUntil ? new Date(validUntil) : null;
    if (usageLimit !== undefined) coupon.usageLimit = Number(usageLimit);
    if (isActive !== undefined) coupon.isActive = Boolean(isActive);

    await coupon.save();
    res.json({ message: "Coupon updated successfully", coupon });
  } catch (err) {
    next(err);
  }
};

// Admin/Super Admin: Delete coupon
const deleteCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid coupon ID" });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    await coupon.deleteOne();
    res.json({ message: "Coupon deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// Admin/Super Admin: Toggle coupon status
const toggleCouponStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid coupon ID" });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean" });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    coupon.isActive = isActive;
    await coupon.save();

    res.json({ message: "Coupon status updated successfully", coupon });
  } catch (err) {
    next(err);
  }
};

// Customer / General: Validate coupon and calculate discount
const validateCoupon = async (req, res, next) => {
  try {
    const { code, orderAmount } = req.body;

    if (!code || orderAmount === undefined) {
      return res.status(400).json({ message: "Coupon code and order amount are required" });
    }

    const amount = Number(orderAmount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid order amount" });
    }

    const coupon = await Coupon.findOne({
      code: code.toUpperCase().trim(),
      isActive: true,
    });

    if (!coupon) {
      return res.status(404).json({ message: "Invalid or inactive coupon code" });
    }

    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) {
      return res.status(400).json({ message: "Coupon is not yet active" });
    }
    if (coupon.validUntil && now > coupon.validUntil) {
      return res.status(400).json({ message: "Coupon has expired" });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ message: "Coupon usage limit reached" });
    }

    if (amount < coupon.minOrderAmount) {
      return res.status(400).json({
        message: `Order amount must be at least ${coupon.minOrderAmount} to use this coupon`,
      });
    }

    let discount = 0;
    if (coupon.discountType === "percentage") {
      discount = (amount * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = Math.min(coupon.discountValue, amount);
    }

    const finalAmount = Math.max(0, amount - discount);

    res.json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: Math.round(discount * 100) / 100,
      finalAmount: Math.round(finalAmount * 100) / 100,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  validateCoupon,
};
