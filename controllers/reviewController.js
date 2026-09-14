const mongoose = require("mongoose");
const Review = require("../models/Review");
const Product = require("../models/Product");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const ALLOWED_REVIEW_STATUSES = ["Pending", "Approved", "Rejected"];

const refreshProductRating = async (productId) => {
  const [summary] = await Review.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId), status: "Approved" } },
    { $group: { _id: null, averageRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
  ]);
  await Product.findByIdAndUpdate(productId, {
    averageRating: summary ? Math.round(summary.averageRating * 10) / 10 : 0,
    reviewCount: summary?.reviewCount || 0,
  });
};

// Admin/Super Admin: Get all reviews
const getAllReviews = async (req, res, next) => {
  try {
    const { status, productId } = req.query;
    const filter = {};

    if (status && ALLOWED_REVIEW_STATUSES.includes(status)) {
      filter.status = status;
    }
    if (productId && isValidId(productId)) {
      filter.productId = productId;
    }

    const reviews = await Review.find(filter)
      .populate("customerId", "_id name email")
      .populate("productId", "_id name price image")
      .sort({ createdAt: -1 });

    res.json({ reviews });
  } catch (err) {
    next(err);
  }
};

// Admin/Super Admin: Update review moderation status
const updateReviewStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid review ID" });
    }

    if (!status || !ALLOWED_REVIEW_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${ALLOWED_REVIEW_STATUSES.join(", ")}`,
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    review.status = status;
    await review.save();
    await refreshProductRating(review.productId);

    await review.populate("customerId", "_id name email");
    await review.populate("productId", "_id name");

    res.json({ message: "Review status updated successfully", review });
  } catch (err) {
    next(err);
  }
};

// Admin/Super Admin: Delete review
const deleteReview = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid review ID" });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    await review.deleteOne();
    await refreshProductRating(review.productId);
    res.json({ message: "Review deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// Public: Get approved reviews for a specific product
const getProductReviews = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!isValidId(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const reviews = await Review.find({ productId, status: "Approved" })
      .populate("customerId", "_id name")
      .sort({ createdAt: -1 });

    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
        : 0;

    res.json({
      productId,
      totalReviews,
      averageRating: Number(averageRating),
      reviews,
    });
  } catch (err) {
    next(err);
  }
};

// Customer: Submit a review for a product
const createProductReview = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { rating, comment } = req.body;

    if (!isValidId(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    if (rating === undefined || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
    }

    if (!comment || typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({ message: "Review comment is required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if customer already reviewed this product
    const existing = await Review.findOne({
      productId,
      customerId: req.user._id,
    });

    if (existing) {
      existing.rating = rating;
      existing.comment = comment.trim();
      existing.status = "Approved";
      await existing.save();
      await refreshProductRating(productId);
      return res.json({ message: "Review updated successfully", review: existing });
    }

    const review = await Review.create({
      productId,
      customerId: req.user._id,
      rating: Math.floor(rating),
      comment: comment.trim(),
      status: "Approved",
    });
    await refreshProductRating(productId);

    res.status(201).json({ message: "Review submitted successfully", review });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllReviews,
  updateReviewStatus,
  deleteReview,
  getProductReviews,
  createProductReview,
};
