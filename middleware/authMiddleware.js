const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");

      // Guard: user deleted from DB after token was issued
      if (!req.user) {
        return res.status(401).json({ message: "Not authorized, user no longer exists" });
      }

      // Guard: user deactivated after token was issued (second-layer protection)
      if (!req.user.isActive) {
        return res.status(401).json({ message: "Not authorized, account has been deactivated" });
      }

      return next();
    } catch (err) {
      return res.status(401).json({ message: "Not authorized, token invalid" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ message: "You do not have permission to perform this action" });
  };
};

module.exports = { protect, restrictTo };
