const mongoose = require("mongoose");
const Product = require("../models/Product");
const cloudinary = require("../config/cloudinary");

// @route  GET /api/products
const getProducts = async (req, res, next) => {
  try {
    const { search, category, minPrice, maxPrice, available, sort } = req.query;
    const filter = {};

    // 1. Search filter: case-insensitive match on name or description
    if (search && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      filter.$or = [
        { name: { $regex: regex } },
        { description: { $regex: regex } },
      ];
    }

    // 2. Category filter: validate ObjectId
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }
      filter.category = category;
    }

    // 3. Price range filter: numeric validation and minPrice <= maxPrice
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) {
        const min = Number(minPrice);
        if (minPrice === "" || isNaN(min) || min < 0) {
          return res.status(400).json({ message: "minPrice must be a valid non-negative number" });
        }
        filter.price.$gte = min;
      }

      if (maxPrice !== undefined) {
        const max = Number(maxPrice);
        if (maxPrice === "" || isNaN(max) || max < 0) {
          return res.status(400).json({ message: "maxPrice must be a valid non-negative number" });
        }
        filter.price.$lte = max;
      }

      if (minPrice !== undefined && maxPrice !== undefined) {
        if (Number(minPrice) > Number(maxPrice)) {
          return res.status(400).json({ message: "minPrice cannot be greater than maxPrice" });
        }
      }
    }

    // 4. Availability filter: must be true or false
    if (available !== undefined) {
      if (available === "true" || available === true) {
        filter.available = true;
      } else if (available === "false" || available === false) {
        filter.available = false;
      } else {
        return res.status(400).json({ message: "available must be true or false" });
      }
    }

    // 5. Sorting: price_asc, price_desc, newest, or default (newest)
    let sortOptions = { createdAt: -1 };
    if (sort) {
      if (sort === "price_asc") {
        sortOptions = { price: 1 };
      } else if (sort === "price_desc") {
        sortOptions = { price: -1 };
      } else if (sort === "newest") {
        sortOptions = { createdAt: -1 };
      } else {
        return res.status(400).json({ message: "Invalid sort option. Allowed values: price_asc, price_desc, newest" });
      }
    }

    const products = await Product.find(filter)
      .populate("category", "name")
      .sort(sortOptions);

    res.json(products);
  } catch (err) {
    next(err);
  }
};

// @route  GET /api/products/:id
const getProductById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    const product = await Product.findById(req.params.id).populate("category", "name");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    next(err);
  }
};

// @route  POST /api/products
const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, stock, category, available } = req.body;
    if (!name || price === undefined || !category) {
      return res.status(400).json({ message: "Name, price, and category are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    if (typeof price !== "number" || price < 0) {
      return res.status(400).json({ message: "Price must be a non-negative number" });
    }

    if (stock !== undefined && (typeof stock !== "number" || stock < 0)) {
      return res.status(400).json({ message: "Stock must be a non-negative number" });
    }

    const product = await Product.create({
      name,
      description,
      price,
      stock: stock !== undefined ? stock : 0,
      category,
      available: available !== undefined ? available : true,
      image: req.file ? { url: req.file.path, publicId: req.file.filename } : undefined,
      createdBy: req.user ? req.user._id : undefined,
    });

    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
};

// @route  PUT /api/products/:id
const updateProduct = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const existingProduct = await Product.findById(req.params.id);
    if (!existingProduct) return res.status(404).json({ message: "Product not found" });

    const updateData = { ...req.body };

    if (updateData.category && !mongoose.Types.ObjectId.isValid(updateData.category)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    if (updateData.price !== undefined && (typeof updateData.price !== "number" || updateData.price < 0)) {
      return res.status(400).json({ message: "Price must be a non-negative number" });
    }

    if (updateData.stock !== undefined && (typeof updateData.stock !== "number" || updateData.stock < 0)) {
      return res.status(400).json({ message: "Stock must be a non-negative number" });
    }

    if (req.file) {
      // remove the old image from Cloudinary so it doesn't linger unused
      if (existingProduct.image && existingProduct.image.publicId) {
        await cloudinary.uploader.destroy(existingProduct.image.publicId);
      }
      updateData.image = { url: req.file.path, publicId: req.file.filename };
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.json(product);
  } catch (err) {
    next(err);
  }
};

// @route  DELETE /api/products/:id
const deleteProduct = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (product.image && product.image.publicId) {
      await cloudinary.uploader.destroy(product.image.publicId);
    }

    await product.deleteOne();
    res.json({ message: "Product deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};