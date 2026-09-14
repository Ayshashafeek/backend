const express = require("express");
const {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
} = require("../controllers/cartController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, restrictTo("customer"), getCart);
router.post("/items", protect, restrictTo("customer"), addCartItem);
router.put("/items/:id", protect, restrictTo("customer"), updateCartItem);
router.delete("/items/:id", protect, restrictTo("customer"), removeCartItem);

module.exports = router;
