const express = require("express");
const {
  getProfile,
  updateProfile,
  logout,
} = require("../controllers/customerController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/profile", protect, restrictTo("customer"), getProfile);
router.put("/profile", protect, restrictTo("customer"), updateProfile);
router.post("/logout", protect, restrictTo("customer"), logout);

module.exports = router;
