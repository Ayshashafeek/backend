const express = require("express");
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");
const { protect, restrictTo } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", protect, restrictTo("admin", "superadmin"), upload.single("image"), createProduct);
router.put("/:id", protect, restrictTo("admin", "superadmin"), upload.single("image"), updateProduct);
router.delete("/:id", protect, restrictTo("admin", "superadmin"), deleteProduct);

module.exports = router;
