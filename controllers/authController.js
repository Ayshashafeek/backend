const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { registerReferral } = require("./referralController");

const generateToken = (user) => {
  return jwt.sign({ id: user._id, tokenVersion: user.tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// @route  POST /api/auth/register
// Public registration always creates a customer account.
// Admin/staff/superadmin accounts can only be created by a Super Admin
// through a separate protected endpoint — not covered by this route.
const registerUser = async (req, res, next) => {
  try {
    const { name, email, password, phone, address, referralCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      if (referralCode) await registerReferral({ referralCode, email: normalizedEmail, phone, address, referredId: userExists._id });
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({ name, email: normalizedEmail, password, phone: phone || "", address: address || {}, role: "customer" });
    await registerReferral({ referralCode, email: normalizedEmail, phone, address, referredId: user._id });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user),
    });
  } catch (err) {
    next(err);
  }
};

// @route  POST /api/auth/login
// Customers log in with { email, password }.
// Admin / staff / superadmin log in with { username, password }.
const loginUser = async (req, res, next) => {
  try {
    const { email, username, password } = req.body;

    if (!password || (!email && !username)) {
      return res.status(400).json({ message: "Provide email or username, and password" });
    }

    const query = email
      ? { email: email.toLowerCase().trim() }
      : { username: username.toLowerCase().trim() };

    const user = await User.findOne(query);

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      token: generateToken(user),
    });
  } catch (err) {
    next(err);
  }
};

// @route  GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    res.json(req.user);
  } catch (err) {
    next(err);
  }
};

// @route  POST /api/auth/logout
const logoutUser = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } });
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

module.exports = { registerUser, loginUser, getMe, logoutUser };
