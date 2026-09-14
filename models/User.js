const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const makeReferralCode = () => `REF${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address"],
    },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      enum: ["customer", "staff", "admin", "superadmin"],
      default: "customer",
    },
    isActive: { type: Boolean, default: true },
    // Incremented on logout to invalidate all previously issued JWTs.
    tokenVersion: { type: Number, default: 0 },
    referralCode: { type: String, unique: true, sparse: true, uppercase: true, default: makeReferralCode },
    rewardPoints: { type: Number, default: 0, min: 0 },
    phone: { type: String, trim: true, default: "" },
    address: {
      street: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      pincode: { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true }
);

// customers need email, everyone else needs username
userSchema.pre("validate", function (next) {
  if (this.role === "customer" && !this.email) {
    return next(new Error("Email is required for customer accounts"));
  }
  if (this.role !== "customer" && !this.username) {
    return next(new Error("Username is required for staff/admin accounts"));
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
