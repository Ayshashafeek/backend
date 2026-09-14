const express = require("express");
const { protect, restrictTo } = require("../middleware/authMiddleware");
const { getMyReferral } = require("../controllers/referralController");
const router = express.Router();
router.get("/me", protect, restrictTo("customer"), getMyReferral);
module.exports = router;
