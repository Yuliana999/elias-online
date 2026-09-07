import { z } from "zod";
import { nameSchema } from "./auth.validators.js";

// Перейменування акаунту (Профіль) — ті самі правила, що й при реєстрації.
export const updateProfileSchema = z.object({
  name: nameSchema,
});

// Аватарка приходить як data URI ("data:image/jpeg;base64,....") — фронтенд
// (utils/image.js) стискає й обрізає фото до ~200x200 перед відправкою, тож
// на практиці рядок виходить в межах кількох десятків кБ. Тут — жорсткий
// бекенд-ліміт незалежно від клієнта (200_000 символів base64 ≈ 150 кБ
// декодованих байтів),  плюс перевірка, що це справді підтримуваний формат
// картинки, а не довільний data URI.
export const updateAvatarSchema = z.object({
  avatar: z
    .string()
    .regex(
      /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/,
      "Непідтримуваний формат зображення"
    )
    .max(200_000, "Зображення завелике"),
});

// Верхня межа — щоб один зіпсований/підроблений запит не роздув
// статистику довільно (реальна одиночна гра рідко коли вгадає/скіпне
// більше кількох сотень слів за партію).
const wordCount = z.number({ invalid_type_error: "Має бути числом" }).int().min(0).max(999);

export const recordSoloResultSchema = z.object({
  guessed: wordCount.optional().default(0),
  skipped: wordCount.optional().default(0),
});
