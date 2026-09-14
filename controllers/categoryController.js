const mongoose = require("mongoose");
const Category = require("../models/Category");
const Product = require("../models/Product");

// @route  GET /api/categories
const getCategories = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && ["Active", "Inactive"].includes(status)) {
      filter.status = status;
    }

    const categories = await Category.find(filter).sort({ createdAt: -1 });
    res.json(categories);
  } catch (err) {
    next(err);
  }
};

// @route  GET /api/categories/:id
const getCategoryById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.json(category);
  } catch (err) {
    next(err);
  }
};

// @route  POST /api/categories
const createCategory = async (req, res, next) => {
  try {
    const { name, description, image, status } = req.body;
    if (!name) return res.status(400).json({ message: "Category name is required" });

    const exists = await Category.findOne({ name });
    if (exists) return res.status(400).json({ message: "Category already exists" });

    const categoryData = {
      name,
      description: description || "",
      image: image || "",
      status: status && ["Active", "Inactive"].includes(status) ? status : "Active",
    };

    const category = await Category.create(categoryData);
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
};

// @route  PUT /api/categories/:id
const updateCategory = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.json(category);
  } catch (err) {
    next(err);
  }
};

// @route  PATCH /api/categories/:id/status
// @desc   Activate or deactivate category (Admin / Super Admin)
const updateCategoryStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    if (!status || !["Active", "Inactive"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'Active' or 'Inactive'" });
    }

    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    category.status = status;
    await category.save();

    res.json({ message: `Category ${status === "Active" ? "activated" : "deactivated"} successfully`, category });
  } catch (err) {
    next(err);
  }
};

// @route  DELETE /api/categories/:id
const deleteCategory = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }
    const productExists = await Product.exists({ category: req.params.id });
    if (productExists) {
      return res.status(409).json({ message: "Cannot delete a category that still has products" });
    }
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.json({ message: "Category deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  deleteCategory,
};
