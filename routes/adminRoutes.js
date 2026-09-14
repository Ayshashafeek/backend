const express = require("express");
const {
  createAdminUser,
  getAllCustomers,
  getAdmins,
  getAllStaff,
  getUserById,
  updateUser,
  updateUserStatus,
  deleteUser,
  changeUserRole,
  resetUserPassword,
  getAdminOrders,
  updateOrderStatus,
} = require("../controllers/adminController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

// ── Existing routes (admin + superadmin) ─────────────────────────────────────
router.post("/create",    protect, restrictTo("admin", "superadmin"), createAdminUser);
router.get("/customers",  protect, restrictTo("admin", "superadmin"), getAllCustomers);

// ── Admin Order Management (admin + superadmin) ──────────────────────────────
router.get("/orders",              protect, restrictTo("admin", "superadmin"), getAdminOrders);
router.put("/orders/:id/status",    protect, restrictTo("admin", "superadmin"), updateOrderStatus);

// ── New Super Admin-only routes ───────────────────────────────────────────────
router.get("/admins",              protect, restrictTo("superadmin"), getAdmins);
router.get("/staff",               protect, restrictTo("superadmin"), getAllStaff);
router.get("/users/:id",           protect, restrictTo("superadmin"), getUserById);
router.put("/users/:id",           protect, restrictTo("superadmin"), updateUser);
router.patch("/users/:id/status",  protect, restrictTo("superadmin"), updateUserStatus);
router.delete("/users/:id",        protect, restrictTo("superadmin"), deleteUser);
router.patch("/users/:id/role",    protect, restrictTo("superadmin"), changeUserRole);
router.patch("/users/:id/password",protect, restrictTo("superadmin"), resetUserPassword);

module.exports = router;