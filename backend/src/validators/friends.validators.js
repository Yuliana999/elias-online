import { z } from "zod";

// Той самий формат, що й публічний ID гравця (backend/src/utils/id.js —
// 6 символів). Алфавіт свідомо не звіряємо суворо регексом: якщо ID
// вигаданий чи з іншим алфавітом, User.findOne в контролері просто
// нічого не знайде і піде звичайна помилка "гравця не знайдено".
export const sendFriendRequestSchema = z.object({
  publicId: z
    .string({ required_error: "Потрібен ID гравця" })
    .trim()
    .toUpperCase()
    .length(6, "ID гравця складається з 6 символів"),
});
