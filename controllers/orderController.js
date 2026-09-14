const mongoose = require("mongoose");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const Cart = require("../models/Cart");
const CartItem = require("../models/CartItem");
const Product = require("../models/Product");
const User = require("../models/User");
const Referral = require("../models/Referral");
const { getSettings } = require("./referralController");
const Coupon = require("../models/Coupon");

// @route   POST /api/orders
// @desc    Checkout customer's cart and create order
// @access  Private (Customer only)
const createOrder = async (req, res, next) => {
  let session = null;
  let useTransaction = false;
  let createdOrderId = null;
  const deductedItems = [];
  let couponReserved = false;

  try {
    // 1. Fetch authenticated user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Find customer's cart first
    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // 3. Find all cart items
    const cartItems = await CartItem.find({ cartId: cart._id });
    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // 4. Resolve and validate shipping address
    const inputAddress = req.body.shippingAddress || {};
    const shippingAddress = {
      street: (inputAddress.street || user.address?.street || "").trim(),
      city: (inputAddress.city || user.address?.city || "").trim(),
      state: (inputAddress.state || user.address?.state || "").trim(),
      pincode: (inputAddress.pincode || user.address?.pincode || "").trim(),
    };

    if (!shippingAddress.street || !shippingAddress.city || !shippingAddress.state || !shippingAddress.pincode) {
      return res.status(400).json({
        message: "Complete delivery address (street, city, state, pincode) is required for checkout",
      });
    }

    const phone = String(req.body.phone || user.phone || "").trim();
    if (!phone) {
      return res.status(400).json({ message: "Phone number is required for checkout" });
    }

    // 5. Re-fetch and strictly validate every product before making any DB mutations
    const validatedItems = [];
    let totalAmount = 0;
    let referral = null;
    let referralDiscount = 0;
    let couponCode = "";
    let couponDiscount = 0;

    for (const item of cartItems) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ message: "One or more products in your cart no longer exist" });
      }

      if (product.available === false) {
        return res.status(400).json({ message: `Product "${product.name}" is currently unavailable` });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for product "${product.name}". Requested: ${item.quantity}, Available: ${product.stock}`,
        });
      }

      // Backend price calculation — ignore any client price or totalAmount
      const currentPrice = product.price;
      const subtotal = currentPrice * item.quantity;
      totalAmount += subtotal;

      validatedItems.push({
        product,
        quantity: item.quantity,
        price: currentPrice,
        productName: product.name,
      });
    }

    const originalAmount = totalAmount;
    if (req.body.couponCode) {
      couponCode = String(req.body.couponCode).trim().toUpperCase();
      const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
      const now = new Date();
      if (!coupon || now < coupon.validFrom || (coupon.validUntil && now > coupon.validUntil) || (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) || totalAmount < coupon.minOrderAmount) {
        return res.status(400).json({ message: "Coupon is invalid, expired, exhausted, or does not meet the order minimum" });
      }
      couponDiscount = coupon.discountType === "percentage" ? totalAmount * coupon.discountValue / 100 : coupon.discountValue;
      if (coupon.maxDiscount !== null) couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
      couponDiscount = Math.min(Math.round(couponDiscount * 100) / 100, totalAmount);
      totalAmount -= couponDiscount;
      // Reserve the coupon at order creation; failed checkout rollback below restores it.
      const reservedCoupon = await Coupon.findOneAndUpdate(
        { _id: coupon._id, $or: [{ usageLimit: null }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }] },
        { $inc: { usedCount: 1 } }, { new: true }
      );
      if (!reservedCoupon) return res.status(400).json({ message: "Coupon usage limit reached" });
      couponReserved = true;
    }
    const hasPreviousOrder = await Order.exists({ userId: user._id, orderStatus: { $ne: "Cancelled" } });
    referral = await Referral.findOne({ referredId: user._id, status: "Pending", firstOrderId: null });
    const referralSettings = await getSettings();
    if (referral && !hasPreviousOrder && referralSettings.enabled && totalAmount >= referralSettings.minimumOrderAmount) {
      referralDiscount = referralSettings.refereeDiscountType === "percentage" ? Math.round(totalAmount * referralSettings.refereeDiscountValue) / 100 : referralSettings.refereeDiscountValue;
      referralDiscount = Math.min(referralDiscount, totalAmount);
      totalAmount -= referralDiscount;
    } else referral = null;

    // 6. Check if the MongoDB deployment supports multi-document transactions (replica set / sharded cluster like Atlas)
    const topologyType = mongoose.connection.client?.topology?.description?.type;
    const supportsTransactions =
      topologyType === "ReplicaSetWithPrimary" || topologyType === "Sharded";

    if (supportsTransactions) {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    }

    const sessionOption = useTransaction ? { session } : {};

    // 7. Create Order document
    let order;
    if (useTransaction) {
      const orderDocs = await Order.create(
        [
          {
            userId: user._id,
            totalAmount,
            shippingAddress,
            phone,
            referralId: referral?._id || null,
            referralDiscount,
            originalAmount,
            couponCode,
            couponDiscount,
            orderStatus: "Order Placed", // Default initial status
          },
        ],
        sessionOption
      );
      order = orderDocs[0];
    } else {
      order = await Order.create({
        userId: user._id,
        totalAmount,
        shippingAddress,
        phone,
        referralId: referral?._id || null,
        referralDiscount,
        originalAmount,
        couponCode,
        couponDiscount,
        orderStatus: "Order Placed",
      });
    }
    createdOrderId = order._id;
    if (referral) {
      referral.firstOrderId = order._id;
      referral.refereeDiscountAmount = referralDiscount;
      await referral.save(sessionOption);
    }

    // 8. Create OrderItem documents (snapshot of product info and price at checkout time)
    const orderItemDocs = validatedItems.map((v) => ({
      orderId: order._id,
      productId: v.product._id,
      productName: v.productName,
      quantity: v.quantity,
      price: v.price,
    }));

    await OrderItem.insertMany(orderItemDocs, sessionOption);

    // 9. Deduct stock for each product
    for (const v of validatedItems) {
      if (useTransaction) {
        v.product.stock -= v.quantity;
        await v.product.save({ session });
      } else {
        // Conditional update prevents concurrent checkouts from overselling stock.
        const updated = await Product.findOneAndUpdate(
          { _id: v.product._id, stock: { $gte: v.quantity }, available: true },
          { $inc: { stock: -v.quantity } },
          { new: true }
        );
        if (!updated) {
          throw new Error(`Insufficient stock for product "${v.productName}" during checkout`);
        }
        deductedItems.push(v);
      }
    }

    // 10. Clear cart items
    if (useTransaction) {
      await CartItem.deleteMany({ cartId: cart._id }, { session });
      await session.commitTransaction();
    } else {
      await CartItem.deleteMany({ cartId: cart._id });
    }

    if (session) {
      session.endSession();
    }

    // 11. Fetch created order items for clean response
    const createdItems = await OrderItem.find({ orderId: order._id });

    res.status(201).json({
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
        items: createdItems.map((ci) => ({
          _id: ci._id,
          orderId: ci.orderId,
          productId: ci.productId,
          productName: ci.productName,
          quantity: ci.quantity,
          price: ci.price,
          subtotal: ci.quantity * ci.price,
        })),
      },
    });
  } catch (err) {
    if (useTransaction && session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        // Ignore abort error
      }
    }
    if (session) {
      session.endSession();
    }
    // Standalone MongoDB cannot use multi-document transactions. Compensate any
    // completed stock deductions and remove partial order records on failure.
    if (!useTransaction && createdOrderId) {
      await Promise.all(deductedItems.map((item) => Product.findByIdAndUpdate(
        item.product._id,
        { $inc: { stock: item.quantity } }
      )));
      await OrderItem.deleteMany({ orderId: createdOrderId });
      await Order.findByIdAndDelete(createdOrderId);
    }
    if (!useTransaction && couponReserved) await Coupon.findOneAndUpdate({ code: couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    next(err);
  }
};

// @route   GET /api/orders
// @desc    Get authenticated customer's own order history
// @access  Private (Customer only)
const getMyOrders = async (req, res, next) => {
  try {
    // Identity strictly from req.user._id, ignoring any client-provided userId
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 });

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

// @route   GET /api/orders/:id
// @desc    Get details of a single order owned by authenticated customer
// @access  Private (Customer only)
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    // Combined query enforcing server-side customer ownership
    const order = await Order.findOne({
      _id: id,
      userId: req.user._id,
    });

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

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
};
