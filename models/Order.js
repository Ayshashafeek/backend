const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    shippingAddress: {
      street: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      pincode: { type: String, required: true, trim: true },
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    orderStatus: {
      type: String,
      enum: [
        "Order Placed",
        "Confirmed",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
      ],
      default: "Order Placed",
    },
    trackingNumber: {
      type: String,
      trim: true,
      default: "",
    },
    courier: {
      type: String,
      trim: true,
      default: "",
    },
    referralId: { type: mongoose.Schema.Types.ObjectId, ref: "Referral", default: null },
    referralDiscount: { type: Number, default: 0, min: 0 },
    originalAmount: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, default: "", uppercase: true, trim: true },
    couponDiscount: { type: Number, default: 0, min: 0 },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
