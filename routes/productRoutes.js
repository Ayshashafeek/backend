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
const productUpload = upload.fields([{ name: "image", maxCount: 1 }, { name: "images", maxCount: 5 }]);
router.post("/", protect, restrictTo("admin", "superadmin"), productUpload, createProduct);
router.put("/:id", protect, restrictTo("admin", "superadmin"), productUpload, updateProduct);
router.delete("/:id", protect, restrictTo("admin", "superadmin"), deleteProduct);

module.exports = router;
