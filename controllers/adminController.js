const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");

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
    const { name, username, password, role } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ message: "Name, username, and password are required" });
    }

    const exists = await User.findOne({ username: username.toLowerCase().trim() });
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
      username: username.toLowerCase().trim(),
      password,
      role: assignedRole,
    });

    res.status(201).json({ _id: user._id, name: user.name, username: user.username, role: user.role });
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

    // Whitelist: only name and username are mutable through this endpoint
    const { name, username } = req.body;

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

    // Whitelist update: ONLY update orderStatus
    order.orderStatus = orderStatus.trim();
    await order.save();

    await order.populate("userId", "_id name email phone");
    const items = await OrderItem.find({ orderId: order._id });

    res.json({
      message: "Order status updated successfully",
      order: {
        _id: order._id,
        userId: order.userId,
        totalAmount: order.totalAmount,
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

module.exports = {
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
};