const express = require("express");
const { protect, restrictTo } = require("../middleware/authMiddleware");
const { createAppReview } = require("../controllers/appReviewController");
const router = express.Router();
router.post("/", protect, restrictTo("customer"), createAppReview);
module.exports = router;
