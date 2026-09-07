import { verifyAccessToken } from "../utils/tokens.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Потрібна авторизація" });
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub; // publicId
    next();
  } catch (err) {
    return res.status(401).json({ error: "Недійсний або прострочений токен" });
  }
}
