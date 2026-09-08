import { z } from "zod";

export const sendMessageSchema = z.object({
  text: z
    .string({ required_error: "Повідомлення не може бути порожнім" })
    .trim()
    .min(1, "Повідомлення не може бути порожнім")
    .max(2000, "Занадто довге повідомлення (макс. 2000 символів)"),
});
