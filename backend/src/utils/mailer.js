import nodemailer from "nodemailer";

/*
  Якщо в .env не задані SMTP_HOST/SMTP_USER/SMTP_PASS — лист просто
  друкується в консоль сервера (зручно для розробки, не треба піднімати
  реальну пошту, щоб перевірити "забув пароль"). Щойно постав реальні
  SMTP-змінні (напр. Gmail app password) — листи підуть насправді.
  Приклад значень — у backend/.env.example.
*/
const SMTP_CONFIGURED = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
);

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true", // true для порту 465, інакше false (STARTTLS)
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail(to, name, resetUrl) {
  const subject = "Відновлення пароля — Еліас Online";
  const text =
    `Привіт, ${name}!\n\n` +
    `Хтось (сподіваємось, ти) попросив скинути пароль до акаунту в Еліас Online.\n` +
    `Перейди за посиланням, щоб задати новий пароль (діє 1 годину):\n\n${resetUrl}\n\n` +
    `Якщо це були не ти — просто ігноруй цей лист, пароль лишиться незмінним.`;

  if (!SMTP_CONFIGURED) {
    console.log(
      `\n[mail] SMTP не налаштовано в .env — лист нижче лише друкується в консоль:\n` +
        `[mail] Кому: ${to}\n[mail] Тема: ${subject}\n[mail] ---\n${text}\n[mail] ---\n`
    );
    return;
  }

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}
