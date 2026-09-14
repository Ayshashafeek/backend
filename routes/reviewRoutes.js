const express = require("express");
const {
  getProductReviews,
  createProductReview,
} = require("../controllers/reviewController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/product/:productId", getProductReviews);
router.post("/product/:productId", protect, restrictTo("customer"), createProductReview);

module.exports = router;
