const express = require("express");
const cors = require("cors");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const adminRoutes = require("./routes/adminRoutes");
const customerRoutes = require("./routes/customerRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const rentalRoutes = require("./routes/rentalRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const couponRoutes = require("./routes/couponRoutes");
const staffRoutes = require("./routes/staffRoutes");
const referralRoutes = require("./routes/referralRoutes");
const appReviewRoutes = require("./routes/appReviewRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Staff operational execution routes
app.use("/api/staff", staffRoutes);

// Admin / Super Admin operational & management routes
app.use("/api/admin", adminRoutes);

// Customer, Cart, Order, Rental, Review & Coupon routes
app.use("/api/customer", customerRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/rentals", rentalRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/app-reviews", appReviewRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Day 1 backend is running" });
});

// Auth + Catalogue routes
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);

// 404 + global error handler
app.use(notFound);
app.use(errorHandler);

module.exports = app;
