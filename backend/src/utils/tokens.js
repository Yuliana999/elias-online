import jwt from "jsonwebtoken";

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.publicId, name: user.name },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m" }
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.publicId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || "30d" }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}
