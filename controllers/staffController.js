const mongoose = require("mongoose");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const Rental = require("../models/Rental");
const Product = require("../models/Product");
const User = require("../models/User");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ===========================================================================
// STAFF DASHBOARD — GET /api/staff/dashboard
// Operational work queue metrics (no financial revenue or profit margin).
// ===========================================================================
const getStaffDashboard = async (req, res, next) => {
  try {
    const ordersToPackCount = await Order.countDocuments({
      orderStatus: { $in: ["Confirmed", "Processing", "Order Placed"] },
    });
    const ordersInTransitCount = await Order.countDocuments({
      orderStatus: "Shipped",
    });
    const rentalsToHandoverCount = await Rental.countDocuments({
      status: "Approved",
    });
    const rentalsOutCount = await Rental.countDocuments({
      status: "Active",
    });
    const lowStockCount = await Product.countDocuments({
      stock: { $lte: 5 },
    });

    res.json({
      tasks: {
        ordersToPackCount,
        ordersInTransitCount,
        rentalsToHandoverCount,
        rentalsOutCount,
        lowStockCount,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// ORDER FULFILLMENT QUEUE — GET /api/staff/orders/queue
// Orders awaiting processing, packing, or shipment.
// ===========================================================================
const getOrderFulfillmentQueue = async (req, res, next) => {
  try {
    const { status } = req.query;
    let statusFilter = { $in: ["Order Placed", "Confirmed", "Processing", "Shipped"] };

    if (status) {
      statusFilter = status;
    }

    const orders = await Order.find({ orderStatus: statusFilter })
      .populate("userId", "_id name email phone address")
      .sort({ createdAt: 1 }); // Oldest first for fair fulfillment

    const formattedOrders = await Promise.all(
      orders.map(async (order) => {
        const items = await OrderItem.find({ orderId: order._id });
        return {
          _id: order._id,
          userId: order.userId,
          orderStatus: order.orderStatus,
          shippingAddress: order.shippingAddress,
          phone: order.phone,
          trackingNumber: order.trackingNumber || "",
          courier: order.courier || "",
          totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
          createdAt: order.createdAt,
        };
      })
    );

    res.json({ queue: formattedOrders });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// ORDER PACKING SLIP — GET /api/staff/orders/:id/packing-slip
// Detailed item checklist and recipient delivery details for warehouse packing.
// ===========================================================================
const getOrderPackingSlip = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(id).populate("userId", "_id name email phone");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const items = await OrderItem.find({ orderId: order._id });

    res.json({
      packingSlip: {
        orderId: order._id,
        recipient: {
          name: order.userId ? order.userId.name : "Customer",
          phone: order.phone,
          shippingAddress: order.shippingAddress,
        },
        orderStatus: order.orderStatus,
        trackingNumber: order.trackingNumber || "",
        courier: order.courier || "",
        items: items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
        })),
        totalItemsCount: items.reduce((sum, item) => sum + item.quantity, 0),
        generatedAt: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// DISPATCH ORDER — PATCH /api/staff/orders/:id/dispatch
// Advance order status to "Shipped" with courier and tracking number.
// ===========================================================================
const dispatchOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { courier, trackingNumber } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.orderStatus === "Cancelled") {
      return res.status(400).json({ message: "Cannot dispatch a cancelled order" });
    }

    if (order.orderStatus === "Delivered") {
      return res.status(400).json({ message: "Order is already marked as Delivered" });
    }

    order.orderStatus = "Shipped";
    if (courier) order.courier = courier.trim();
    if (trackingNumber) order.trackingNumber = trackingNumber.trim();
    await order.save();

    res.json({
      message: "Order dispatched successfully",
      order: {
        _id: order._id,
        orderStatus: order.orderStatus,
        courier: order.courier,
        trackingNumber: order.trackingNumber,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// DELIVER ORDER — PATCH /api/staff/orders/:id/deliver
// Advance order status to "Delivered".
// ===========================================================================
const deliverOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.orderStatus === "Cancelled") {
      return res.status(400).json({ message: "Cannot deliver a cancelled order" });
    }

    order.orderStatus = "Delivered";
    await order.save();

    res.json({
      message: "Order marked as Delivered",
      order: {
        _id: order._id,
        orderStatus: order.orderStatus,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// RENTAL QUEUE — GET /api/staff/rentals/queue
// Rentals awaiting pickup/handover (Approved) or return inspection (Active).
// ===========================================================================
const getRentalQueue = async (req, res, next) => {
  try {
    const { status } = req.query;
    let filter = { status: { $in: ["Approved", "Active"] } };

    if (status && ["Approved", "Active"].includes(status)) {
      filter.status = status;
    }

    const rentals = await Rental.find(filter)
      .populate("customerId", "_id name email phone")
      .populate("productId", "_id name price image")
      .sort({ startDate: 1 });

    res.json({ queue: rentals });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// RENTAL HANDOVER — PATCH /api/staff/rentals/:id/handover
// Customer pickup / dispatch: advance from "Approved" to "Active".
// ===========================================================================
const handoverRental = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { handoverNotes } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid rental ID" });
    }

    const rental = await Rental.findById(id);
    if (!rental) {
      return res.status(404).json({ message: "Rental not found" });
    }

    if (rental.status !== "Approved") {
      return res.status(400).json({
        message: `Only Approved rentals can be handed over. Current status: ${rental.status}`,
      });
    }

    rental.status = "Active";
    if (handoverNotes) {
      rental.notes = rental.notes
        ? `${rental.notes} | Handover: ${handoverNotes.trim()}`
        : `Handover: ${handoverNotes.trim()}`;
    }
    await rental.save();

    res.json({
      message: "Rental marked as Active (Jewellery handed over to customer)",
      rental,
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// RENTAL RETURN — PATCH /api/staff/rentals/:id/return
// Physical return & condition inspection: advance from "Active" to "Returned".
// ===========================================================================
const returnRental = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { inspectionNotes } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid rental ID" });
    }

    const rental = await Rental.findById(id);
    if (!rental) {
      return res.status(404).json({ message: "Rental not found" });
    }

    if (rental.status !== "Active") {
      return res.status(400).json({
        message: `Only Active rentals can be returned. Current status: ${rental.status}`,
      });
    }

    rental.status = "Returned";
    if (inspectionNotes) {
      rental.notes = rental.notes
        ? `${rental.notes} | Return Inspection: ${inspectionNotes.trim()}`
        : `Return Inspection: ${inspectionNotes.trim()}`;
    }
    await rental.save();

    res.json({
      message: "Rental marked as Returned (Inspection completed)",
      rental,
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// INVENTORY CHECKLIST (READ-ONLY) — GET /api/staff/inventory
// Staff can view stock quantities and categories (cannot modify prices/catalog).
// ===========================================================================
const getStaffInventory = async (req, res, next) => {
  try {
    const products = await Product.find()
      .populate("category", "name")
      .select("name category price stock available image")
      .sort({ stock: 1 });

    res.json({
      totalProducts: products.length,
      inventory: products,
    });
  } catch (err) {
    next(err);
  }
};

// ===========================================================================
// CUSTOMER SUPPORT LOOKUP — GET /api/staff/customers/lookup
// Safe search for customer contact/address to resolve delivery/tracking queries.
// ===========================================================================
const lookupCustomer = async (req, res, next) => {
  try {
    const { email, phone, name } = req.query;

    if (!email && !phone && !name) {
      return res.status(400).json({ message: "Provide email, phone, or name to search" });
    }

    const query = { role: "customer" };
    if (email) query.email = email.toLowerCase().trim();
    if (phone) query.phone = phone.trim();
    if (name) query.name = { $regex: name.trim(), $options: "i" };

    const customers = await User.find(query)
      .select("_id name email phone address createdAt")
      .limit(10);

    res.json({ customers });
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};
