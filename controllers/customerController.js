const User = require("../models/User");

// @route   GET /api/customer/profile
// @desc    Get logged-in customer's own profile
// @access  Private (Customer only)
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// @route   PUT /api/customer/profile
// @desc    Update logged-in customer's own profile (name, phone, address, email)
// @access  Private (Customer only)
const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { name, phone, address, email } = req.body;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }
      user.name = name.trim();
    }

    if (email !== undefined) {
      const trimmedEmail = email.toLowerCase().trim();
      if (!trimmedEmail) {
        return res.status(400).json({ message: "Email cannot be empty" });
      }
      const conflict = await User.findOne({ email: trimmedEmail, _id: { $ne: user._id } });
      if (conflict) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = trimmedEmail;
    }

    if (phone !== undefined) {
      user.phone = typeof phone === "string" ? phone.trim() : String(phone).trim();
    }

    if (address !== undefined && typeof address === "object" && address !== null) {
      user.address = {
        street: address.street !== undefined ? String(address.street).trim() : (user.address?.street || ""),
        city: address.city !== undefined ? String(address.city).trim() : (user.address?.city || ""),
        state: address.state !== undefined ? String(address.state).trim() : (user.address?.state || ""),
        pincode: address.pincode !== undefined ? String(address.pincode).trim() : (user.address?.pincode || ""),
      };
    }

    // Explicitly reject/ignore role, isActive, password tampering
    await user.save();

    const updatedUser = await User.findById(user._id).select("-password");
    res.json(updatedUser);
  } catch (err) {
    next(err);
  }
};

// @route   POST /api/customer/logout
// @desc    Customer logout (stateless JWT token discard)
// @access  Private (Customer only)
const logout = async (req, res, next) => {
  try {
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  logout,
};
