import { z } from "zod";

// Той самий підхід нормалізації, що й submitWordsSchema (lobby.validators.js):
// обрізаємо пробіли, прибираємо порожні й дублікати, щоб контролер уже
// отримував чистий список слів.
const wordsField = z
  .array(z.string().trim().min(1).max(40))
  .min(1, "Додай хоча б одне слово")
  .max(60, "Максимум 60 слів у колоді")
  .transform((arr) => [...new Set(arr)]);

const nameField = z
  .string({ required_error: "Потрібна назва колоди" })
  .trim()
  .min(1, "Потрібна назва колоди")
  .max(40, "Назва задовга (максимум 40 символів)");

export const createDeckSchema = z.object({
  name: nameField,
  words: wordsField,
});

// При редагуванні обидва поля опційні (можна поправити лише назву або
// лише слова), але хоч щось передати таки треба.
export const updateDeckSchema = z
  .object({
    name: nameField.optional(),
    words: wordsField.optional(),
  })
  .refine((data) => data.name !== undefined || data.words !== undefined, {
    message: "Нічого оновлювати — вкажи назву або слова",
  });
