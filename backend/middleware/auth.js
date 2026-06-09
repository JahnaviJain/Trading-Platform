// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1]; // Extract token from "Bearer <token>"
  if (!token) return res.status(401).send({ message: "Access denied. No token provided." });

  try {
    const decoded = jwt.verify(token, process.env.JWTPRIVATEKEY); // Make sure this matches your secret key
    req.user = decoded; // Store decoded payload in request
    next();
  } catch (error) {
    res.status(400).send({ message: "Invalid token." });
  }
};

module.exports = authMiddleware;
