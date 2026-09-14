const mongoose = require("mongoose");
const Rental = require("../models/Rental");
const Product = require("../models/Product");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const ALLOWED_RENTAL_STATUSES = [
  "Pending",
  "Approved",
  "Active",
  "Returned",
  "Overdue",
  "Cancelled",
];

// Admin/Super Admin: Get all rentals with filters
const getRentals = async (req, res, next) => {
  try {
    const { status, customerId, productId } = req.query;
    const filter = {};

    if (status && ALLOWED_RENTAL_STATUSES.includes(status)) {
      filter.status = status;
    }
    if (customerId && isValidId(customerId)) {
      filter.customerId = customerId;
    }
    if (productId && isValidId(productId)) {
      filter.productId = productId;
    }

    const rentals = await Rental.find(filter)
      .populate("customerId", "_id name email phone")
      .populate("productId", "_id name price image")
      .sort({ createdAt: -1 });

    res.json({ rentals });
  } catch (err) {
    next(err);
  }
};

// Admin/Super Admin: Get single rental by ID
const getRentalById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid rental ID" });
    }

    const rental = await Rental.findById(id)
      .populate("customerId", "_id name email phone")
      .populate("productId", "_id name price image");

    if (!rental) {
      return res.status(404).json({ message: "Rental not found" });
    }

    res.json(rental);
  } catch (err) {
    next(err);
  }
};

// Admin/Super Admin: Create rental record directly
const createRental = async (req, res, next) => {
  try {
    const { customerId, productId, startDate, endDate, rentalFee, depositAmount, notes } = req.body;

    if (!customerId || !productId || !startDate || !endDate || rentalFee === undefined) {
      return res.status(400).json({ message: "Customer, product, start date, end date, and rental fee are required" });
    }

    if (!isValidId(customerId) || !isValidId(productId)) {
      return res.status(400).json({ message: "Invalid customer ID or product ID" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const rental = await Rental.create({
      customerId,
      productId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      rentalFee: Number(rentalFee),
      depositAmount: depositAmount !== undefined ? Number(depositAmount) : 0,
      notes: notes ? String(notes).trim() : "",
      status: "Approved",
    });

    await rental.populate("customerId", "_id name email phone");
    await rental.populate("productId", "_id name price image");

    res.status(201).json({ message: "Rental created successfully", rental });
  } catch (err) {
    next(err);
  }
};

// Admin/Super Admin: Update rental status
const updateRentalStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid rental ID" });
    }

    if (!status || !ALLOWED_RENTAL_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${ALLOWED_RENTAL_STATUSES.join(", ")}`,
      });
    }

    const rental = await Rental.findById(id);
    if (!rental) {
      return res.status(404).json({ message: "Rental not found" });
    }

    rental.status = status;
    await rental.save();

    await rental.populate("customerId", "_id name email phone");
    await rental.populate("productId", "_id name price image");

    res.json({ message: "Rental status updated successfully", rental });
  } catch (err) {
    next(err);
  }
};

// Customer: View my rentals
const getMyRentals = async (req, res, next) => {
  try {
    const rentals = await Rental.find({ customerId: req.user._id })
      .populate("productId", "_id name price image")
      .sort({ createdAt: -1 });

    res.json({ rentals });
  } catch (err) {
    next(err);
  }
};

// Customer: Submit a rental booking request
const requestRental = async (req, res, next) => {
  try {
    const { productId, startDate, endDate, notes } = req.body;

    if (!productId || !startDate || !endDate) {
      return res.status(400).json({ message: "Product, start date, and end date are required" });
    }

    if (!isValidId(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Calculate rental duration in days
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ message: "End date must be after start date" });
    }

    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    // Default daily rate: 10% of product price per day or min fee
    const dailyRate = Math.round(product.price * 0.05);
    const rentalFee = Math.max(dailyRate * days, 50);
    const depositAmount = Math.round(product.price * 0.3);

    const rental = await Rental.create({
      customerId: req.user._id,
      productId,
      startDate: start,
      endDate: end,
      rentalFee,
      depositAmount,
      notes: notes ? String(notes).trim() : "",
      status: "Pending",
    });

    await rental.populate("productId", "_id name price image");

    res.status(201).json({ message: "Rental booking request submitted", rental });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getRentals,
  getRentalById,
  createRental,
  updateRentalStatus,
  getMyRentals,
  requestRental,
};
