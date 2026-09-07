// Валідує req.body за переданою zod-схемою. При помилці одразу повертає
// 400 з переліком проблемних полів — контролер більше не бачить "сирих"
// невалідних даних.
export function validate(schema) {
  return function validateBody(req, res, next) {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      }));
      return res.status(400).json({ error: "Некоректні дані", details });
    }

    req.body = result.data;
    next();
  };
}
