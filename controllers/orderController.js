const mongoose = require("mongoose");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const Cart = require("../models/Cart");
const CartItem = require("../models/CartItem");
const Product = require("../models/Product");
const User = require("../models/User");

// @route   POST /api/orders
// @desc    Checkout customer's cart and create order
// @access  Private (Customer only)
const createOrder = async (req, res, next) => {
  let session = null;
  let useTransaction = false;

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

    const phone = (req.body.phone || user.phone || "").trim();

    // 5. Re-fetch and strictly validate every product before making any DB mutations
    const validatedItems = [];
    let totalAmount = 0;

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
        orderStatus: "Order Placed",
      });
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
      v.product.stock -= v.quantity;
      if (useTransaction) {
        await v.product.save({ session });
      } else {
        await v.product.save();
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
