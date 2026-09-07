import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { genUniquePublicId } from "../utils/id.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";

function setRefreshCookie(res, token) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export async function register(req, res) {
  // name/password вже перевірені й нормалізовані мідлваром validate(registerSchema)
  const { name, password } = req.body;
  const nameKey = name.toLowerCase();

  const existing = await User.findOne({ nameKey });
  if (existing) {
    return res.status(409).json({ error: "Це ім'я вже зайняте, спробуй інше" });
  }

  const publicId = await genUniquePublicId(User);
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    publicId,
    name,
    nameKey,
    passwordHash,
  });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await user.save();

  setRefreshCookie(res, refreshToken);
  res.status(201).json({ user: user.toPublicJSON(), accessToken });
}

export async function login(req, res) {
  const { name, password } = req.body;

  const user = await User.findOne({ nameKey: name.toLowerCase() });
  if (!user) {
    return res.status(401).json({ error: "Невірне ім'я або пароль" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Невірне ім'я або пароль" });
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await user.save();

  setRefreshCookie(res, refreshToken);
  res.json({ user: user.toPublicJSON(), accessToken });
}

export async function refresh(req, res) {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return res.status(401).json({ error: "Немає refresh-токена" });
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return res.status(401).json({ error: "Недійсний refresh-токен" });
  }

  const user = await User.findOne({ publicId: payload.sub });
  if (!user?.refreshTokenHash) {
    return res.status(401).json({ error: "Сесія недійсна, увійдіть знову" });
  }

  const matches = await bcrypt.compare(token, user.refreshTokenHash);
  if (!matches) {
    return res.status(401).json({ error: "Сесія недійсна, увійдіть знову" });
  }

  const accessToken = signAccessToken(user);
  res.json({ accessToken });
}

export async function logout(req, res) {
  const token = req.cookies?.refreshToken;
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await User.updateOne({ publicId: payload.sub }, { refreshTokenHash: null });
    } catch {
      // токен вже недійсний — просто чистимо кукі
    }
  }
  res.clearCookie("refreshToken");
  res.status(204).end();
}

export async function me(req, res) {
  const user = await User.findOne({ publicId: req.userId });
  if (!user) return res.status(404).json({ error: "Користувача не знайдено" });
  res.json({ user: user.toPublicJSON() });
}
