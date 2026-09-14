const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const CartItem = require("../models/CartItem");
const Product = require("../models/Product");

// Helper to validate MongoDB ObjectId
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Helper to get or create cart for user and format complete cart response
const getFormattedCart = async (userId) => {
  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({ userId });
  }

  const items = await CartItem.find({ cartId: cart._id }).populate(
    "productId",
    "name price stock available image category"
  );

  let totalAmount = 0;
  let totalQuantity = 0;

  const formattedItems = [];

  for (const item of items) {
    // If product still exists in DB, synchronize price to current catalog price
    if (item.productId && typeof item.productId.price === "number") {
      if (item.price !== item.productId.price) {
        item.price = item.productId.price;
        await item.save();
      }
    }

    const itemSubtotal = item.quantity * item.price;
    totalAmount += itemSubtotal;
    totalQuantity += item.quantity;

    formattedItems.push({
      _id: item._id,
      product: item.productId,
      quantity: item.quantity,
      price: item.price,
      subtotal: itemSubtotal,
    });
  }

  return {
    _id: cart._id,
    userId: cart.userId,
    items: formattedItems,
    totalQuantity,
    totalAmount,
  };
};

// @route   GET /api/cart
// @desc    Get authenticated customer's cart
// @access  Private (Customer only)
const getCart = async (req, res, next) => {
  try {
    const cart = await getFormattedCart(req.user._id);
    res.json({ cart });
  } catch (err) {
    next(err);
  }
};

// @route   POST /api/cart/items
// @desc    Add product to cart (or increase quantity if already in cart)
// @access  Private (Customer only)
const addCartItem = async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;

    // Validate productId
    if (!productId || !isValidId(productId)) {
      return res.status(400).json({ message: "Valid productId is required" });
    }

    // Validate quantity: must be positive integer
    if (quantity === undefined || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be a positive integer" });
    }

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Verify product is available
    if (product.available === false) {
      return res.status(400).json({ message: "Product is currently unavailable" });
    }

    // Find or create customer's cart
    let cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) {
      cart = await Cart.create({ userId: req.user._id });
    }

    // Check if product already exists in cart
    let cartItem = await CartItem.findOne({ cartId: cart._id, productId: product._id });

    if (cartItem) {
      const newQuantity = cartItem.quantity + quantity;
      if (newQuantity > product.stock) {
        return res.status(400).json({
          message: `Requested total quantity (${newQuantity}) exceeds available stock (${product.stock})`,
        });
      }
      cartItem.quantity = newQuantity;
      cartItem.price = product.price; // sync with backend price
      await cartItem.save();
    } else {
      if (quantity > product.stock) {
        return res.status(400).json({
          message: `Requested quantity (${quantity}) exceeds available stock (${product.stock})`,
        });
      }
      await CartItem.create({
        cartId: cart._id,
        productId: product._id,
        quantity,
        price: product.price, // price from database, ignoring client-provided price
      });
    }

    const formattedCart = await getFormattedCart(req.user._id);
    res.status(201).json({ cart: formattedCart });
  } catch (err) {
    next(err);
  }
};

// @route   PUT /api/cart/items/:id
// @desc    Update quantity of a cart item
// @access  Private (Customer only)
const updateCartItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid cart item ID" });
    }

    if (quantity === undefined || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be a positive integer" });
    }

    const cartItem = await CartItem.findById(id);
    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    // Ownership check: verify this cart belongs to req.user._id
    const cart = await Cart.findById(cartItem.cartId);
    if (!cart || !cart.userId.equals(req.user._id)) {
      return res.status(403).json({ message: "You do not have permission to modify this cart item" });
    }

    // Verify product exists, is available, and has sufficient stock
    const product = await Product.findById(cartItem.productId);
    if (!product) {
      return res.status(404).json({ message: "Product no longer exists" });
    }

    if (product.available === false) {
      return res.status(400).json({ message: "Product is currently unavailable" });
    }

    if (quantity > product.stock) {
      return res.status(400).json({
        message: `Requested quantity (${quantity}) exceeds available stock (${product.stock})`,
      });
    }

    cartItem.quantity = quantity;
    cartItem.price = product.price; // sync with backend price
    await cartItem.save();

    const formattedCart = await getFormattedCart(req.user._id);
    res.json({ cart: formattedCart });
  } catch (err) {
    next(err);
  }
};

// @route   DELETE /api/cart/items/:id
// @desc    Remove an item from the cart
// @access  Private (Customer only)
const removeCartItem = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid cart item ID" });
    }

    const cartItem = await CartItem.findById(id);
    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    // Ownership check
    const cart = await Cart.findById(cartItem.cartId);
    if (!cart || !cart.userId.equals(req.user._id)) {
      return res.status(403).json({ message: "You do not have permission to delete this cart item" });
    }

    await cartItem.deleteOne();

    const formattedCart = await getFormattedCart(req.user._id);
    res.json({
      message: "Item removed from cart successfully",
      cart: formattedCart,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
};
