const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    material: { type: String, trim: true, default: "" },
    weight: { type: String, trim: true, default: "" },
    size: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Out of Stock"],
      default: "Active",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    image: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
    },
    // Kept alongside image for backwards compatibility with existing clients.
    images: [{ url: { type: String, default: "" }, publicId: { type: String, default: "" } }],
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    available: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
