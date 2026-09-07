import rateLimit from "express-rate-limit";

// Реєстрація/вхід/refresh — найчастіша ціль для перебору паролів чи спаму
// акаунтів. 20 спроб на 15 хв з одного IP — з запасом для реальних людей
// (включно з помилками введення), але вже боляче для брутфорсу.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Забагато спроб. Спробуй ще раз за кілька хвилин." },
});
