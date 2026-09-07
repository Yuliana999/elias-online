import { z } from "zod";

// Верхня межа — щоб один зіпсований/підроблений запит не роздув
// статистику довільно (реальна одиночна гра рідко коли вгадає/скіпне
// більше кількох сотень слів за партію).
const wordCount = z.number({ invalid_type_error: "Має бути числом" }).int().min(0).max(999);

export const recordSoloResultSchema = z.object({
  guessed: wordCount.optional().default(0),
  skipped: wordCount.optional().default(0),
});
