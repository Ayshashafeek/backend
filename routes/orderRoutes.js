const express = require("express");
const {
  createOrder,
  getMyOrders,
  getOrderById,
} = require("../controllers/orderController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, restrictTo("customer"), createOrder);
router.get("/", protect, restrictTo("customer"), getMyOrders);
router.get("/:id", protect, restrictTo("customer"), getOrderById);

module.exports = router;
