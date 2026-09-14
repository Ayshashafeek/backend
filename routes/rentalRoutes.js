const express = require("express");
const {
  getMyRentals,
  requestRental,
  getRentalById,
} = require("../controllers/rentalController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, restrictTo("customer"), requestRental);
router.get("/my", protect, restrictTo("customer"), getMyRentals);
router.get("/:id", protect, getRentalById);

module.exports = router;
