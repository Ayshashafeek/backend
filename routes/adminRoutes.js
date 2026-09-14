const express = require("express");
const {
  createAdminUser,
  getAllCustomers,
  getCustomerById,
  updateCustomerStatus,
  getAdmins,
  getAllStaff,
  getUserById,
  updateUser,
  updateUserStatus,
  deleteUser,
  changeUserRole,
  resetUserPassword,
  getAdminOrders,
  getAdminOrderById,
  updateOrderStatus,
  getInventory,
  updateInventoryStock,
  getAdminDashboard,
} = require("../controllers/adminController");
const {
  getRentals,
  getRentalById,
  createRental,
  updateRentalStatus,
} = require("../controllers/rentalController");
const {
  getAllReviews,
  updateReviewStatus,
  deleteReview,
} = require("../controllers/reviewController");
const {
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
} = require("../controllers/couponController");
const { protect, restrictTo } = require("../middleware/authMiddleware");
const { getAdminReferrals, getAdminReferralById, getReferralSettings, updateReferralSettings } = require("../controllers/referralController");
const { listAppReviews, deleteAppReview } = require("../controllers/appReviewController");

const router = express.Router();

// ── Operational Dashboard (Admin + Superadmin) ──────────────────────────────
router.get("/dashboard", protect, restrictTo("admin", "superadmin"), getAdminDashboard);

// ── Admin User Creation (Admin creates staff; Superadmin creates admin/staff) ─
router.post("/create", protect, restrictTo("admin", "superadmin"), createAdminUser);

// ── Operational Customer Management (Admin + Superadmin) ────────────────────
router.get("/customers", protect, restrictTo("admin", "superadmin"), getAllCustomers);
router.get("/customers/:id", protect, restrictTo("admin", "superadmin"), getCustomerById);
router.patch("/customers/:id/status", protect, restrictTo("admin", "superadmin"), updateCustomerStatus);

// ── Operational Order Management (Admin + Superadmin) ───────────────────────
router.get("/orders", protect, restrictTo("admin", "superadmin"), getAdminOrders);
router.get("/orders/:id", protect, restrictTo("admin", "superadmin"), getAdminOrderById);
router.put("/orders/:id/status", protect, restrictTo("admin", "superadmin"), updateOrderStatus);

// ── Operational Inventory Management (Admin + Superadmin) ───────────────────
router.get("/inventory", protect, restrictTo("admin", "superadmin"), getInventory);
router.patch("/inventory/:id", protect, restrictTo("admin", "superadmin"), updateInventoryStock);

// ── Operational Rentals Management (Admin + Superadmin) ─────────────────────
router.get("/rentals", protect, restrictTo("admin", "superadmin"), getRentals);
router.get("/rentals/:id", protect, restrictTo("admin", "superadmin"), getRentalById);
router.post("/rentals", protect, restrictTo("admin", "superadmin"), createRental);
router.patch("/rentals/:id/status", protect, restrictTo("admin", "superadmin"), updateRentalStatus);

// ── Operational Reviews Moderation (Admin + Superadmin) ─────────────────────
router.get("/reviews", protect, restrictTo("admin", "superadmin"), getAllReviews);
router.patch("/reviews/:id/status", protect, restrictTo("admin", "superadmin"), updateReviewStatus);
router.delete("/reviews/:id", protect, restrictTo("admin", "superadmin"), deleteReview);
router.get("/app-reviews", protect, restrictTo("admin", "superadmin"), listAppReviews);
router.delete("/app-reviews/:id", protect, restrictTo("admin", "superadmin"), deleteAppReview);

// ── Operational Coupons Management (Admin + Superadmin) ─────────────────────
router.get("/coupons", protect, restrictTo("admin", "superadmin"), getCoupons);
router.get("/coupons/:id", protect, restrictTo("admin", "superadmin"), getCouponById);
router.post("/coupons", protect, restrictTo("admin", "superadmin"), createCoupon);
router.put("/coupons/:id", protect, restrictTo("admin", "superadmin"), updateCoupon);
router.delete("/coupons/:id", protect, restrictTo("admin", "superadmin"), deleteCoupon);
router.patch("/coupons/:id/status", protect, restrictTo("admin", "superadmin"), toggleCouponStatus);

// Referral programme monitoring and settings (separate from coupons)
router.get("/referrals", protect, restrictTo("admin", "superadmin"), getAdminReferrals);
router.get("/referrals/settings", protect, restrictTo("admin", "superadmin"), getReferralSettings);
router.put("/referrals/settings", protect, restrictTo("admin", "superadmin"), updateReferralSettings);
router.get("/referrals/:id", protect, restrictTo("admin", "superadmin"), getAdminReferralById);

// ── Strictly Super Admin-Only Management Routes ─────────────────────────────
router.get("/admins", protect, restrictTo("superadmin"), getAdmins);
router.get("/staff", protect, restrictTo("superadmin"), getAllStaff);
router.get("/users/:id", protect, restrictTo("superadmin"), getUserById);
router.put("/users/:id", protect, restrictTo("superadmin"), updateUser);
router.patch("/users/:id/status", protect, restrictTo("superadmin"), updateUserStatus);
router.delete("/users/:id", protect, restrictTo("superadmin"), deleteUser);
router.patch("/users/:id/role", protect, restrictTo("superadmin"), changeUserRole);
router.patch("/users/:id/password", protect, restrictTo("superadmin"), resetUserPassword);

module.exports = router;
