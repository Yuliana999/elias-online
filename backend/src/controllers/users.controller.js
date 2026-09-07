import User from "../models/User.js";
import { signAccessToken } from "../utils/tokens.js";

// Профіль будь-якого гравця за publicId — той самий формат, що й у
// /api/auth/me (User.toPublicJSON вже містить stats), лише для чужого
// акаунту. Вимагає авторизації (щоб не роздавати профілі анонімно), але
// не перевіряє, що це "свій" профіль — так само, як publicId і так можна
// побачити в лобі поруч з іменем гравця.
export async function getProfile(req, res) {
  const user = await User.findOne({ publicId: req.params.publicId });
  if (!user) return res.status(404).json({ error: "Користувача не знайдено" });
  res.json({ profile: user.toPublicJSON() });
}

// Зміна імені акаунту (екран Профіль). Ті самі правила унікальності, що й
// при реєстрації (auth.controller.js#register) — nameKey нижнього регістру
// звіряємо серед УСІХ інших користувачів (виключно себе).
// Ім'я, яке вже "розлетілось" по активних лобі/сокетах (socket.userName —
// див. sockets/index.js), там не оновлюється заднім числом і підхопиться
// лише після перепідключення — прийнятний компроміс, бо це лише для логів.
export async function updateProfile(req, res) {
  const { name } = req.body;
  const nameKey = name.toLowerCase();

  const user = await User.findOne({ publicId: req.userId });
  if (!user) return res.status(404).json({ error: "Користувача не знайдено" });

  if (nameKey !== user.nameKey) {
    const clash = await User.findOne({ nameKey, publicId: { $ne: req.userId } });
    if (clash) return res.status(409).json({ error: "Це ім'я вже зайняте, спробуй інше" });
  }

  user.name = name;
  user.nameKey = nameKey;
  await user.save();

  // Перевидаємо access-токен (як при вході) — щоб нове ім'я одразу
  // потрапило в його payload.
  const accessToken = signAccessToken(user);
  res.json({ user: user.toPublicJSON(), accessToken });
}

// Одиночна гра (SoloSetup/Game.jsx) — повністю локальна, без лобі й без
// сокетів, тож на відміну від онлайн-партій (де рахунок веде сервер і
// сам оновлює stats — sockets/index.js#recordGameStats) статистику сюди
// шле клієнт після завершення, best-effort, лише якщо гравець залогинений
// (не гість — див. App.jsx#isGuest). Числа обрізаємо знизу нулем і
// зверху розумним лімітом (валідатор), щоб зіпсований/підроблений запит
// не роздув статистику довільно.
export async function recordSoloResult(req, res) {
  const { guessed, skipped } = req.body;

  await User.updateOne(
    { publicId: req.userId },
    {
      $inc: {
        "stats.gamesPlayed": 1,
        "stats.wordsGuessed": guessed,
        "stats.wordsMissed": skipped,
      },
    }
  );

  res.status(204).end();
}
