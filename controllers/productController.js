const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");
const cloudinary = require("../config/cloudinary");

// @route  GET /api/products
const getProducts = async (req, res, next) => {
  try {
    const { search, category, minPrice, maxPrice, material, available, status, sort } = req.query;
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

    // 3. Material filter (Gold, Silver, Diamond, Platinum, etc.)
    if (material && material.trim()) {
      const escapedMat = material.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.material = { $regex: new RegExp(escapedMat, "i") };
    }

    // 4. Status filter (Active, Inactive, Out of Stock)
    if (status && ["Active", "Inactive", "Out of Stock"].includes(status)) {
      filter.status = status;
    }

    // 5. Price range filter: numeric validation and minPrice <= maxPrice
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

    // 6. Availability filter: must be true or false
    if (available !== undefined) {
      if (available === "true" || available === true) {
        filter.available = true;
      } else if (available === "false" || available === false) {
        filter.available = false;
      } else {
        return res.status(400).json({ message: "available must be true or false" });
      }
    }

    // 7. Sorting: price_asc, price_desc, newest, popular, or default (newest)
    let sortOptions = { createdAt: -1 };
    if (sort) {
      if (sort === "price_asc") {
        sortOptions = { price: 1 };
      } else if (sort === "price_desc") {
        sortOptions = { price: -1 };
      } else if (sort === "newest") {
        sortOptions = { createdAt: -1 };
      } else if (sort === "popular") {
        sortOptions = { reviewCount: -1, averageRating: -1, createdAt: -1 };
      } else {
        return res.status(400).json({
          message: "Invalid sort option. Allowed values: price_asc, price_desc, newest, popular",
        });
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

    // Fetch related products in the same category
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      available: true,
      status: "Active",
    }).limit(4);

    const productObj = product.toObject ? product.toObject() : { ...product };
    res.json({
      ...productObj,
      relatedProducts,
    });
  } catch (err) {
    next(err);
  }
};

// @route  POST /api/products
const createProduct = async (req, res, next) => {
  try {
    const {
      name,
      description,
      price,
      stock,
      category,
      available,
      material,
      weight,
      size,
      status,
    } = req.body;

    if (!name || price === undefined || !category) {
      return res.status(400).json({ message: "Name, price, and category are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }
    const categoryExists = await Category.exists({ _id: category });
    if (!categoryExists) return res.status(400).json({ message: "Category does not exist" });

    if (typeof price !== "number" || price < 0) {
      return res.status(400).json({ message: "Price must be a non-negative number" });
    }

    if (stock !== undefined && (typeof stock !== "number" || stock < 0)) {
      return res.status(400).json({ message: "Stock must be a non-negative number" });
    }

    const stockVal = stock !== undefined ? stock : 0;
    if (status && !["Active", "Inactive", "Out of Stock"].includes(status)) {
      return res.status(400).json({ message: "Invalid product status" });
    }
    const initialStatus = stockVal === 0 ? "Out of Stock" : (status || "Active");
    const uploadedFiles = [
      ...(req.files?.image || []),
      ...(req.files?.images || []),
    ].map((file) => ({ url: file.path, publicId: file.filename }));
    const primaryImage = uploadedFiles[0];

    const product = await Product.create({
      name,
      description: description || "",
      price,
      stock: stockVal,
      category,
      material: material || "",
      weight: weight || "",
      size: size || "",
      status: initialStatus,
      available: initialStatus === "Active" && stockVal > 0 && (available !== undefined ? available : true),
      image: primaryImage,
      images: uploadedFiles,
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
    if (updateData.category && !(await Category.exists({ _id: updateData.category }))) {
      return res.status(400).json({ message: "Category does not exist" });
    }

    if (updateData.price !== undefined && (typeof updateData.price !== "number" || updateData.price < 0)) {
      return res.status(400).json({ message: "Price must be a non-negative number" });
    }

    if (updateData.stock !== undefined && (typeof updateData.stock !== "number" || updateData.stock < 0)) {
      return res.status(400).json({ message: "Stock must be a non-negative number" });
    }

    if (updateData.status && !["Active", "Inactive", "Out of Stock"].includes(updateData.status)) {
      return res.status(400).json({ message: "Invalid product status" });
    }
    const newStock = updateData.stock !== undefined ? updateData.stock : existingProduct.stock;
    const newStatus = newStock === 0 ? "Out of Stock" : (updateData.status || existingProduct.status);
    updateData.status = newStatus;
    updateData.available = newStatus === "Active" && newStock > 0 &&
      (updateData.available !== undefined ? updateData.available : existingProduct.available);

    const uploadedFiles = [...(req.files?.image || []), ...(req.files?.images || [])]
      .map((file) => ({ url: file.path, publicId: file.filename }));
    if (uploadedFiles.length) {
      if (existingProduct.image && existingProduct.image.publicId) {
        await cloudinary.uploader.destroy(existingProduct.image.publicId);
      }
      updateData.image = uploadedFiles[0];
      updateData.images = uploadedFiles;
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

    await Promise.all((product.images?.length ? product.images : [product.image])
      .filter((image) => image?.publicId)
      .map((image) => cloudinary.uploader.destroy(image.publicId)));

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
