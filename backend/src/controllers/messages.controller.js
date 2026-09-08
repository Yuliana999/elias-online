import Message from "../models/Message.js";
import Friendship from "../models/Friendship.js";
import { emitChatMessage } from "../sockets/index.js";

function toPublic(m) {
  return {
    id: m._id.toString(),
    fromId: m.fromId,
    toId: m.toId,
    text: m.text,
    createdAt: m.createdAt,
    readAt: m.readAt,
  };
}

// Писати можна лише другові — та сама перевірка, що й у друзів
// (Friendship status=accepted, незалежно від того, хто кому надсилав
// заявку), тож дублюємо її тут окремою функцією замість імпорту з
// friends.controller.js (там вона не експортована й прив'язана до
// конкретної форми відповіді).
async function ensureFriends(userId, otherId) {
  const friendship = await Friendship.findOne({
    status: "accepted",
    $or: [
      { requesterId: userId, addresseeId: otherId },
      { requesterId: otherId, addresseeId: userId },
    ],
  });
  return !!friendship;
}

// Список розмов: по одному запису на співрозмовника з останнім
// повідомленням і кількістю непрочитаного — саме це показує Chat.jsx у
// закритому вигляді (перелік тредів) і на бейджі кнопки чату. Рахуємо тут,
// а не окремим полем на User, бо непрочитане залежить від пари
// співрозмовників, а не глобальне.
export async function listThreads(req, res) {
  const userId = req.userId;
  const messages = await Message.find({
    $or: [{ fromId: userId }, { toId: userId }],
  }).sort({ createdAt: -1 });

  const threads = new Map();
  for (const m of messages) {
    const otherId = m.fromId === userId ? m.toId : m.fromId;
    if (!threads.has(otherId)) {
      threads.set(otherId, {
        friendId: otherId,
        lastMessage: m.text,
        lastAt: m.createdAt,
        unread: 0,
      });
    }
    if (m.toId === userId && !m.readAt) {
      threads.get(otherId).unread += 1;
    }
  }

  // Map зберігає порядок вставки — а вставляємо в порядку messages
  // (найновіші перші), тож треди вже відсортовані за останньою активністю.
  res.json({ threads: [...threads.values()] });
}

// Історія переписки з конкретним другом (макс. останні 200 повідомлень —
// цього прототипу вистачає, пагінацію не робимо). Заразом позначає
// прочитаними всі вхідні повідомлення цього треда — так само, як
// відкриття дзвіночка (friends.controller.js#markRequestsSeen), тільки
// без окремого ендпоінта: сам факт відкриття розмови й означає "побачив".
export async function listConversation(req, res) {
  const userId = req.userId;
  const friendId = req.params.friendId;

  if (!(await ensureFriends(userId, friendId))) {
    return res.status(403).json({ error: "Писати можна лише друзям" });
  }

  const messages = await Message.find({
    $or: [
      { fromId: userId, toId: friendId },
      { fromId: friendId, toId: userId },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(200);

  await Message.updateMany(
    { fromId: friendId, toId: userId, readAt: null },
    { readAt: new Date() }
  );

  res.json({ messages: messages.map(toPublic) });
}

// Надіслати повідомлення другу. Реальний час — через ту саму особисту
// кімнату user:<publicId>, що й заявки в друзі (sockets/index.js):
// якщо отримувач зараз онлайн (на будь-якому екрані, не лише в чаті),
// Chat.jsx одразу домальовує повідомлення й підніме тред.
export async function sendMessage(req, res) {
  const userId = req.userId;
  const friendId = req.params.friendId;
  const { text } = req.body;

  if (friendId === userId) {
    return res.status(400).json({ error: "Не можна написати самому собі" });
  }
  if (!(await ensureFriends(userId, friendId))) {
    return res.status(403).json({ error: "Писати можна лише друзям" });
  }

  const message = await Message.create({ fromId: userId, toId: friendId, text });

  const io = req.app.get("io");
  emitChatMessage(io, friendId, toPublic(message));

  res.status(201).json({ message: toPublic(message) });
}
