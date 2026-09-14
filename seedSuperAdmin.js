/**
 * One-time seed script — creates the initial superadmin account.
 * Run once from the JW-Ecom directory:
 *   node seedSuperAdmin.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const connectDB = require("./config/db");

const SUPERADMIN = {
  name: "Super Admin",
  username: process.env.SUPERADMIN_USERNAME,
  password: process.env.SUPERADMIN_PASSWORD,
  role: "superadmin",
};
if (!SUPERADMIN.username || !SUPERADMIN.password) {
  console.error("Missing SUPERADMIN_USERNAME or SUPERADMIN_PASSWORD in .env");
  process.exit(1);
}

(async () => {
  await connectDB();

  const existing = await User.findOne({ username: SUPERADMIN.username });
if (existing) {
  existing.password = SUPERADMIN.password;
  await existing.save(); // pre("save") hook re-hashes it
  console.log(`Superadmin "${SUPERADMIN.username}" password updated.`);
  await mongoose.disconnect();
  return;
}

  await User.create(SUPERADMIN);
  console.log(`Superadmin "${SUPERADMIN.username}" created successfully.`);
  await mongoose.disconnect();
})();
