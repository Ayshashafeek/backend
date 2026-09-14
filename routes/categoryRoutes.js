const express = require("express");
const {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  deleteCategory,
} = require("../controllers/categoryController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", getCategories);
router.get("/:id", getCategoryById);
router.post("/", protect, restrictTo("admin", "superadmin"), createCategory);
router.put("/:id", protect, restrictTo("admin", "superadmin"), updateCategory);
router.patch("/:id/status", protect, restrictTo("admin", "superadmin"), updateCategoryStatus);
router.delete("/:id", protect, restrictTo("admin", "superadmin"), deleteCategory);

module.exports = router;
