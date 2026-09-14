const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const Product = require("../models/Product");
const Rental = require("../models/Rental");
const Review = require("../models/Review");
const AppReview = require("../models/AppReview");
const Coupon = require("../models/Coupon");
const Referral = require("../models/Referral");
const ReferralSettings = require("../models/ReferralSettings");

// ---------------------------------------------------------------------------
// Helper — validate that a string is a valid MongoDB ObjectId
// ---------------------------------------------------------------------------
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ---------------------------------------------------------------------------
// Helper — remove the password field before sending a user document in a
// response. Works on both plain objects (toObject()) and Mongoose docs.
// ---------------------------------------------------------------------------
const sanitiseUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  return obj;
};

// ===========================================================================
// EXISTING — POST /api/admin/create
// Superadmin can create staff or admin (NOT another superadmin).
// Admin can only create staff.
// ===========================================================================
const createAdminUser = async (req, res, next) => {
  try {
    const { name, username, email, phone, password, role } = req.body;
    const loginName = (username || email?.split("@")[0] || "").toLowerCase().trim();

    if (!name || !loginName || !password) {
      return res.status(400).json({ message: "Name, username or email, and password are required" });
    }

    const exists = await User.findOne({ username: loginName });
    if (exists) {
      return res.status(400).json({ message: "Username already taken" });
    }

    const callerRole = req.user.role;
    let assignedRole;

    if (callerRole === "superadmin") {
      // superadmin can create staff or admin — NOT another superadmin
      const allowedRoles = ["staff", "admin"];
      assignedRole = allowedRoles.includes(role) ? role : "staff";
    } else if (callerRole === "admin") {
      assignedRole = "staff"; // admin can ONLY create staff, regardless of req.body.role
    } else {
      return res.status(403).json({ message: "You do not have permission to create users" });
    }

    const user = await User.create({
      name,
      username: loginName,
      email: email ? email.toLowerCase().trim() : undefined,
      phone: phone || "",
      password,
      role: assignedRole,
    });

    res.status(201).json({ _id: user._id, name: user.name, username: user.username, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// EXISTING — GET /api/admin/customers
// Returns all customer accounts (admin + superadmin).
// ===========================================================================
const getAllCustomers = async (req, res, next) => {
  try {
    const customers = await User.find({ role: "customer" }).select("-password");
    res.json(customers);
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// NEW — GET /api/admin/admins   (superadmin only)
// Returns all users with role "admin".
// ===========================================================================
const getAdmins = async (req, res, next) => {
  try {
    const admins = await User.find({ role: "admin" }).select("-password");
    res.json(admins);
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// NEW — GET /api/admin/staff   (superadmin only)
// Returns all users with role "staff".
// ===========================================================================
const getAllStaff = async (req, res, next) => {
  try {
    const staffUsers = await User.find({ role: "staff" }).select("-password");
    res.json(staffUsers);
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// NEW — GET /api/admin/users/:id   (superadmin only)
// Returns a single admin or staff user by ID.
// Customers are excluded — they belong to the customer management endpoint.
// ===========================================================================
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "customer") {
      return res.status(403).json({ message: "Use the customer management endpoint for customer accounts" });
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// NEW — PUT /api/admin/users/:id   (superadmin only)
// Updates whitelisted profile fields (name, username) for an admin or staff.
// Rejected for: superadmin targets, customer targets.
// Injected fields (role, password, isActive, etc.) are silently ignored.
// ===========================================================================
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user._id.equals(req.user._id)) {
      return res.status(403).json({ message: "You cannot modify your own account" });
    }

    if (user.role === "superadmin") {
      return res.status(403).json({ message: "Cannot modify a Super Admin account" });
    }

    if (user.role === "customer") {
      return res.status(403).json({ message: "Use the customer management endpoint for customer accounts" });
    }

    // Whitelist: only profile fields are mutable through this endpoint
    const { name, username, email, phone } = req.body;

    if (username !== undefined) {
      const trimmed = username.toLowerCase().trim();
      const conflict = await User.findOne({ username: trimmed, _id: { $ne: id } });
      if (conflict) {
        return res.status(400).json({ message: "Username already taken" });
      }
      user.username = trimmed;
    }

    if (name !== undefined) {
      user.name = name.trim();
    }
    if (email !== undefined) {
      const normalized = email.toLowerCase().trim();
      const conflict = await User.findOne({ email: normalized, _id: { $ne: id } });
      if (conflict) return res.status(400).json({ message: "Email already in use" });
      user.email = normalized;
    }
    if (phone !== undefined) user.phone = String(phone).trim();

    await user.save();
    const updated = await User.findById(id).select("-password");
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// NEW — PATCH /api/admin/users/:id/status   (superadmin only)
// Activate or deactivate an admin or staff user.
// Rejected for: self, superadmin targets, customer targets.
// ===========================================================================
const updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean (true or false)" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user._id.equals(req.user._id)) {
      return res.status(403).json({ message: "You cannot change your own account status" });
    }

    if (user.role === "superadmin") {
      return res.status(403).json({ message: "Cannot modify the status of a Super Admin account" });
    }

    if (user.role === "customer") {
      return res.status(403).json({ message: "Use the customer management endpoint for customer accounts" });
    }

    user.isActive = isActive;
    await user.save();
    const updated = await User.findById(id).select("-password");
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// NEW — DELETE /api/admin/users/:id   (superadmin only)
// Permanently deletes an admin or staff user.
// Rejected for: self, superadmin targets, customer targets.
// Note: products created by the deleted user remain intact (ecommerce data
// is not cascaded — createdBy becomes an orphaned reference).
// ===========================================================================
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user._id.equals(req.user._id)) {
      return res.status(403).json({ message: "You cannot delete your own account" });
    }

    if (user.role === "superadmin") {
      return res.status(403).json({ message: "Cannot delete a Super Admin account" });
    }

    if (user.role === "customer") {
      return res.status(403).json({ message: "Use the customer management endpoint for customer accounts" });
    }

    await user.deleteOne();
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// NEW — PATCH /api/admin/users/:id/role   (superadmin only)
// Changes a user's role between "staff" and "admin" only.
// Rejected for: superadmin targets, customer targets, self, invalid roles,
// promotion to superadmin, no-op (same role).
// ===========================================================================
const changeUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const { role: newRole } = req.body;
    const allowedRoles = ["staff", "admin"];

    if (!newRole || !allowedRoles.includes(newRole)) {
      return res.status(400).json({ message: `Role must be one of: ${allowedRoles.join(", ")}` });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "superadmin") {
      return res.status(403).json({ message: "Cannot change the role of a Super Admin account" });
    }

    if (user.role === "customer") {
      return res.status(403).json({ message: "Use the customer management endpoint for customer accounts" });
    }

    if (user._id.equals(req.user._id)) {
      return res.status(403).json({ message: "You cannot change your own role" });
    }

    if (user.role === newRole) {
      return res.status(400).json({ message: `User already has the role: ${newRole}` });
    }

    user.role = newRole;
    await user.save();
    const updated = await User.findById(id).select("-password");
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// NEW — PATCH /api/admin/users/:id/password   (superadmin only)
// Resets the password of an admin or staff user.
// Delegates hashing to the existing User pre("save") bcrypt hook —
// no manual hashing here, no risk of double-hashing.
// Rejected for: superadmin targets, customer targets.
// Never returns the password or its hash.
// ===========================================================================
const resetUserPassword = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const { newPassword } = req.body;

    // Reuse existing model rule: minimum 6 characters
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "superadmin") {
      return res.status(403).json({ message: "Cannot reset the password of a Super Admin account" });
    }

    if (user.role === "customer") {
      return res.status(403).json({ message: "Use the customer management endpoint for customer accounts" });
    }

    // Assign plaintext — the pre("save") hook in User.js will bcrypt-hash it (salt rounds = 10)
    user.password = newPassword;
    await user.save();

    // Return only confirmation — never expose the hash
    res.json({ message: "Password reset successfully" });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// ADMIN ORDER MANAGEMENT — GET /api/admin/orders
// Returns all customer orders across customers (admin + superadmin).
// Newest orders first. Includes customer info (safe fields) and OrderItems.
// ===========================================================================
const getAdminOrders = async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate("userId", "_id name email phone")
      .sort({ createdAt: -1 });

    const formattedOrders = await Promise.all(
      orders.map(async (order) => {
        const items = await OrderItem.find({ orderId: order._id });
        return {
          _id: order._id,
          userId: order.userId,
          totalAmount: order.totalAmount,
          originalAmount: order.originalAmount || order.totalAmount,
          couponCode: order.couponCode,
          couponDiscount: order.couponDiscount,
          referralDiscount: order.referralDiscount,
          deliveredAt: order.deliveredAt,
          shippingAddress: order.shippingAddress,
          phone: order.phone,
          orderStatus: order.orderStatus,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          items: items.map((item) => ({
            _id: item._id,
            orderId: item.orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.quantity * item.price,
          })),
        };
      })
    );

    res.json({ orders: formattedOrders });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// ADMIN ORDER MANAGEMENT — PUT /api/admin/orders/:id/status
// Update order status (admin + superadmin).
// Only allowed enum values accepted; field tampering strictly prevented.
// ===========================================================================
const ALLOWED_ORDER_STATUSES = [
  "Order Placed",
  "Confirmed",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
];

const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const { orderStatus } = req.body;

    if (
      !orderStatus ||
      typeof orderStatus !== "string" ||
      !ALLOWED_ORDER_STATUSES.includes(orderStatus.trim())
    ) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const transitions = {
      "Order Placed": ["Confirmed", "Cancelled"],
      Confirmed: ["Processing", "Cancelled"],
      Processing: ["Shipped", "Cancelled"],
      Shipped: ["Delivered"],
      Delivered: [],
      Cancelled: [],
    };
    if (!transitions[order.orderStatus].includes(orderStatus.trim())) {
      return res.status(400).json({
        message: `Cannot change order status from ${order.orderStatus} to ${orderStatus.trim()}`,
      });
    }
    if (orderStatus.trim() === "Confirmed" && order.referralId) {
      const referral = await Referral.findOne({ _id: order.referralId, status: "Pending", firstOrderId: order._id });
      if (referral) {
        const settings = await ReferralSettings.findOne({ key: "default" });
        const points = settings?.referrerRewardPoints || 0;
        await User.findByIdAndUpdate(referral.referrerId, { $inc: { rewardPoints: points } });
        referral.status = "Completed";
        referral.referrerRewardPoints = points;
        referral.rewardGivenAt = new Date();
        await referral.save();
      }
    }
    // Return stock exactly once when an order is cancelled.
    if (orderStatus.trim() === "Cancelled") {
      const items = await OrderItem.find({ orderId: order._id });
      for (const item of items) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: item.quantity },
          $set: { status: "Active", available: true },
        });
      }
      if (order.referralId) await Referral.findOneAndUpdate({ _id: order.referralId, status: "Pending", firstOrderId: order._id }, { status: "Cancelled" });
      if (order.couponCode) await Coupon.findOneAndUpdate({ code: order.couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    }
    // Whitelist update: ONLY update orderStatus
    order.orderStatus = orderStatus.trim();
    if (order.orderStatus === "Delivered") order.deliveredAt = new Date();
    await order.save();

    await order.populate("userId", "_id name email phone");
    const items = await OrderItem.find({ orderId: order._id });

    res.json({
      message: "Order status updated successfully",
      order: {
        _id: order._id,
        userId: order.userId,
        totalAmount: order.totalAmount,
        originalAmount: order.originalAmount || order.totalAmount,
        couponCode: order.couponCode,
        couponDiscount: order.couponDiscount,
        referralDiscount: order.referralDiscount,
        deliveredAt: order.deliveredAt,
        shippingAddress: order.shippingAddress,
        phone: order.phone,
        orderStatus: order.orderStatus,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: items.map((item) => ({
          _id: item._id,
          orderId: item.orderId,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.quantity * item.price,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// ADMIN CUSTOMER MANAGEMENT — GET /api/admin/customers/:id
// Get single customer profile and aggregated order stats (admin + superadmin).
// ===========================================================================
const getCustomerById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    const customer = await User.findOne({ _id: id, role: "customer" }).select("-password");
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const orders = await Order.find({ userId: customer._id }).sort({ createdAt: -1 });
    const totalOrders = orders.length;
    const totalSpent = orders
      .filter((o) => o.orderStatus !== "Cancelled")
      .reduce((sum, o) => sum + o.totalAmount, 0);

    res.json({
      customer,
      stats: {
        totalOrders,
        totalSpent,
      },
      recentOrders: orders.slice(0, 5),
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// ADMIN CUSTOMER MANAGEMENT — PATCH /api/admin/customers/:id/status
// Activate or deactivate a customer account (admin + superadmin).
// ===========================================================================
const updateCustomerStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean (true or false)" });
    }

    const customer = await User.findOne({ _id: id, role: "customer" });
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    customer.isActive = isActive;
    await customer.save();

    const updated = await User.findById(id).select("-password");
    res.json({
      message: `Customer account ${isActive ? "activated" : "deactivated"} successfully`,
      customer: updated,
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// ADMIN ORDER MANAGEMENT — GET /api/admin/orders/:id
// Get single order with full customer info and line items (admin + superadmin).
// ===========================================================================
const getAdminOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(id).populate("userId", "_id name email phone address");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const items = await OrderItem.find({ orderId: order._id });

    res.json({
      order: {
        _id: order._id,
        userId: order.userId,
        totalAmount: order.totalAmount,
        originalAmount: order.originalAmount || order.totalAmount,
        couponCode: order.couponCode,
        couponDiscount: order.couponDiscount,
        referralDiscount: order.referralDiscount,
        deliveredAt: order.deliveredAt,
        shippingAddress: order.shippingAddress,
        phone: order.phone,
        orderStatus: order.orderStatus,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: items.map((item) => ({
          _id: item._id,
          orderId: item.orderId,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          subtotal: item.quantity * item.price,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// ADMIN INVENTORY MANAGEMENT — GET /api/admin/inventory
// Returns product stock levels, low-stock warnings, and inventory statistics.
// ===========================================================================
const getInventory = async (req, res, next) => {
  try {
    const { lowStock, threshold = 5 } = req.query;
    const threshNum = Math.max(0, Number(threshold) || 5);

    const allProducts = await Product.find()
      .populate("category", "name")
      .sort({ stock: 1 });

    const totalProducts = allProducts.length;
    let totalUnits = 0;
    let totalInventoryValue = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    const inventoryList = allProducts.map((p) => {
      const stock = p.stock || 0;
      const price = p.price || 0;
      totalUnits += stock;
      totalInventoryValue += stock * price;

      if (stock === 0) outOfStockCount++;
      if (stock > 0 && stock <= threshNum) lowStockCount++;

      return {
        _id: p._id,
        name: p.name,
        category: p.category,
        price: p.price,
        stock: p.stock,
        available: p.available,
        isLowStock: stock > 0 && stock <= threshNum,
        isOutOfStock: stock === 0,
        inventoryValue: stock * price,
        image: p.image,
      };
    });

    const filteredList =
      lowStock === "true"
        ? inventoryList.filter((item) => item.isLowStock || item.isOutOfStock)
        : inventoryList;

    res.json({
      summary: {
        totalProducts,
        totalUnits,
        outOfStockCount,
        lowStockCount,
        totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
        threshold: threshNum,
      },
      inventory: filteredList,
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// ADMIN INVENTORY MANAGEMENT — PATCH /api/admin/inventory/:id
// Quick update of a product stock level (direct set or adjustment).
// ===========================================================================
const updateInventoryStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stock, adjustment } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (stock !== undefined) {
      if (typeof stock !== "number" || stock < 0) {
        return res.status(400).json({ message: "Stock must be a non-negative number" });
      }
      product.stock = stock;
    } else if (adjustment !== undefined) {
      if (typeof adjustment !== "number") {
        return res.status(400).json({ message: "Adjustment must be a number" });
      }
      const newStock = product.stock + adjustment;
      if (newStock < 0) {
        return res.status(400).json({
          message: `Adjustment would result in negative stock (${newStock})`,
        });
      }
      product.stock = newStock;
    } else {
      return res.status(400).json({ message: "Provide either stock or adjustment" });
    }

    await product.save();

    if (product.stock === 0) {
      product.status = "Out of Stock";
      product.available = false;
    } else if (product.status === "Out of Stock") {
      product.status = "Active";
      product.available = true;
    }
    await product.save();

    res.json({
      message: "Inventory updated successfully",
      product: {
        _id: product._id,
        name: product.name,
        stock: product.stock,
        price: product.price,
        available: product.available,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// ADMIN DASHBOARD — GET /api/admin/dashboard
// Real-time overview of business operations (admin + superadmin).
// ===========================================================================
const getAdminDashboard = async (req, res, next) => {
  try {
    // Orders & Revenue
    const allOrders = await Order.find();
    const totalOrders = allOrders.length;
    const totalRevenue = allOrders
      .filter((o) => o.orderStatus !== "Cancelled")
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const ordersByStatus = {
      "Order Placed": 0,
      Confirmed: 0,
      Processing: 0,
      Shipped: 0,
      Delivered: 0,
      Cancelled: 0,
    };
    allOrders.forEach((o) => {
      if (ordersByStatus[o.orderStatus] !== undefined) {
        ordersByStatus[o.orderStatus]++;
      }
    });

    // Customers
    const totalCustomers = await User.countDocuments({ role: "customer" });
    const activeCustomers = await User.countDocuments({ role: "customer", isActive: true });

    // Products & Inventory
    const allProducts = await Product.find();
    const totalProducts = allProducts.length;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    allProducts.forEach((p) => {
      if (p.stock === 0) outOfStockCount++;
      else if (p.stock <= 5) lowStockCount++;
    });

    // Rentals
    const totalRentals = await Rental.countDocuments();
    const activeRentals = await Rental.countDocuments({ status: "Active" });
    const pendingRentals = await Rental.countDocuments({ status: "Pending" });

    // Reviews
    const totalReviews = await Review.countDocuments();
    const pendingReviews = await Review.countDocuments({ status: "Pending" });
    const recentProductReviews = await Review.find().populate("customerId", "name email").populate("productId", "name image").sort({ createdAt: -1 }).limit(5);
    const recentAppReviews = await AppReview.find().populate("customerId", "name email").sort({ createdAt: -1 }).limit(5);

    // Coupons
    const totalCoupons = await Coupon.countDocuments();
    const activeCoupons = await Coupon.countDocuments({ isActive: true });

    // Recent orders (5 newest)
    const recentOrders = await Order.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .limit(5);

    // Recent rentals (5 newest)
    const recentRentals = await Rental.find()
      .populate("customerId", "name email")
      .populate("productId", "name")
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      revenue: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        currency: "INR",
      },
      orders: {
        totalOrders,
        ordersByStatus,
      },
      customers: {
        totalCustomers,
        activeCustomers,
      },
      inventory: {
        totalProducts,
        lowStockCount,
        outOfStockCount,
      },
      rentals: {
        totalRentals,
        activeRentals,
        pendingRentals,
      },
      reviews: {
        totalReviews,
        pendingReviews,
      },
      recentProductReviews,
      recentAppReviews,
      coupons: {
        totalCoupons,
        activeCoupons,
      },
      recentOrders,
      recentRentals,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};
