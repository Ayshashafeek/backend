/**
 * One-time seed script — creates the initial product categories.
 * Safe to re-run: any category that already exists (matched by name) is skipped.
 *
 * Run once from the JW-Ecom directory:
 *   node seedCategories.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("./models/Category");
const connectDB = require("./config/db");

const CATEGORIES = [
  { name: "Rings", description: "" },
  { name: "Necklaces", description: "" },
  { name: "Earrings", description: "" },
  { name: "Bracelets", description: "" },
  { name: "Bangles", description: "" },
  { name: "Chains", description: "" },
  { name: "Bridal Jewellery", description: "" },
];

(async () => {
  await connectDB();

  for (const cat of CATEGORIES) {
    const existing = await Category.findOne({ name: cat.name });
    if (existing) {
      console.log(`Skipped "${cat.name}" — already exists.`);
      continue;
    }
    await Category.create(cat);
    console.log(`Created "${cat.name}".`);
  }

  console.log("Done.");
  await mongoose.disconnect();
})();