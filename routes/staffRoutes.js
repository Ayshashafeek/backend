const express = require("express");
const {
  getStaffDashboard,
  getOrderFulfillmentQueue,
  getOrderPackingSlip,
  dispatchOrder,
  deliverOrder,
  getRentalQueue,
  handoverRental,
  returnRental,
  getStaffInventory,
  lookupCustomer,
} = require("../controllers/staffController");
const { protect, restrictTo } = require("../middleware/authMiddleware");

const router = express.Router();

// All staff endpoints are accessible by staff, admin, and superadmin
router.use(protect, restrictTo("staff", "admin", "superadmin"));

// Staff Task Dashboard
router.get("/dashboard", getStaffDashboard);

// Order Fulfillment & Logistics
router.get("/orders/queue", getOrderFulfillmentQueue);
router.get("/orders/:id/packing-slip", getOrderPackingSlip);
router.patch("/orders/:id/dispatch", dispatchOrder);
router.patch("/orders/:id/deliver", deliverOrder);

// Rental Counter (Pickup & Return)
router.get("/rentals/queue", getRentalQueue);
router.patch("/rentals/:id/handover", handoverRental);
router.patch("/rentals/:id/return", returnRental);

// Inventory & Support
router.get("/inventory", getStaffInventory);
router.get("/customers/lookup", lookupCustomer);

module.exports = router;
