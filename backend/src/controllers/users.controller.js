import User from "../models/User.js";

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
