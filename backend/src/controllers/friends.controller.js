import Friendship from "../models/Friendship.js";
import User from "../models/User.js";
import { emitFriendRequest, emitFriendAccepted } from "../sockets/index.js";

// Компактний профіль для списків друзів/заявок — ім'я, id і базова
// статистика (той самий підрахунок accuracy, що й User.toPublicJSON),
// без зайвих полів на кшталт паролю чи дат.
function toPeer(user) {
  const { gamesPlayed = 0, wordsGuessed = 0, wordsMissed = 0 } = user.stats || {};
  const attempts = wordsGuessed + wordsMissed;
  return {
    id: user.publicId,
    name: user.name,
    stats: {
      gamesPlayed,
      accuracy: attempts > 0 ? Math.round((wordsGuessed / attempts) * 100) : 0,
    },
  };
}

function byPublicId(users) {
  return Object.fromEntries(users.map((u) => [u.publicId, u]));
}

// Друзі (status=accepted, я — requester чи addressee) + вхідні заявки
// (status=pending, я — addressee). Вихідні заявки (я комусь надіслав і
// ще чекаю) тут не показуємо — щоб не ускладнювати екран; від повторного
// надсилання захищає перевірка в sendRequest.
export async function listFriends(req, res) {
  const [accepted, pending] = await Promise.all([
    Friendship.find({
      status: "accepted",
      $or: [{ requesterId: req.userId }, { addresseeId: req.userId }],
    }).sort({ updatedAt: -1 }),
    Friendship.find({ status: "pending", addresseeId: req.userId }).sort({ createdAt: -1 }),
  ]);

  const friendIds = accepted.map((f) => (f.requesterId === req.userId ? f.addresseeId : f.requesterId));
  const requesterIds = pending.map((f) => f.requesterId);

  const [friendUsers, requesterUsers] = await Promise.all([
    User.find({ publicId: { $in: friendIds } }),
    User.find({ publicId: { $in: requesterIds } }),
  ]);
  const friendUserById = byPublicId(friendUsers);
  const requesterUserById = byPublicId(requesterUsers);

  res.json({
    friends: accepted
      .map((f) => {
        const otherId = f.requesterId === req.userId ? f.addresseeId : f.requesterId;
        const u = friendUserById[otherId];
        return u ? { friendshipId: f._id.toString(), ...toPeer(u) } : null;
      })
      .filter(Boolean),
    requests: pending
      .map((f) => {
        const u = requesterUserById[f.requesterId];
        return u ? { id: f._id.toString(), seen: f.seen, createdAt: f.createdAt, from: toPeer(u) } : null;
      })
      .filter(Boolean),
  });
}

// Надіслати заявку в друзі за publicId. Заборонено собі, вже другу, чи
// якщо в будь-якому напрямку вже є заявка, що очікує рішення.
export async function sendRequest(req, res) {
  const { publicId } = req.body;

  if (publicId === req.userId) {
    return res.status(400).json({ error: "Не можна додати себе в друзі" });
  }

  const target = await User.findOne({ publicId });
  if (!target) return res.status(404).json({ error: "Гравця з таким ID не знайдено" });

  const existing = await Friendship.findOne({
    $or: [
      { requesterId: req.userId, addresseeId: publicId },
      { requesterId: publicId, addresseeId: req.userId },
    ],
  });
  if (existing?.status === "accepted") {
    return res.status(409).json({ error: "Ви вже друзі" });
  }
  if (existing?.status === "pending") {
    return res.status(409).json({ error: "Заявка вже надіслана — чекайте відповіді" });
  }

  const requester = await User.findOne({ publicId: req.userId });
  const friendship = await Friendship.create({ requesterId: req.userId, addresseeId: publicId });

  const io = req.app.get("io");
  emitFriendRequest(io, publicId, {
    id: friendship._id.toString(),
    seen: false,
    createdAt: friendship.createdAt,
    from: toPeer(requester),
  });

  res.status(201).json({ request: { id: friendship._id.toString() } });
}

// Прийняти вхідну заявку — лише адресат.
export async function acceptRequest(req, res) {
  const friendship = await Friendship.findOne({
    _id: req.params.id,
    addresseeId: req.userId,
    status: "pending",
  });
  if (!friendship) return res.status(404).json({ error: "Заявку не знайдено" });

  friendship.status = "accepted";
  await friendship.save();

  const [me, requester] = await Promise.all([
    User.findOne({ publicId: req.userId }),
    User.findOne({ publicId: friendship.requesterId }),
  ]);

  // Той, хто надсилав заявку, дізнається про прийняття в реальному часі —
  // якщо він зараз онлайн (у своїй персональній кімнаті — sockets/index.js).
  const io = req.app.get("io");
  if (me) {
    emitFriendAccepted(io, friendship.requesterId, {
      friendshipId: friendship._id.toString(),
      ...toPeer(me),
    });
  }

  res.json({
    friend: requester ? { friendshipId: friendship._id.toString(), ...toPeer(requester) } : null,
  });
}

// Відхилити вхідну заявку (адресат) або скасувати свою вихідну (відправник) —
// в обох випадках просто видаляємо запис.
export async function declineRequest(req, res) {
  const friendship = await Friendship.findOne({
    _id: req.params.id,
    status: "pending",
    $or: [{ addresseeId: req.userId }, { requesterId: req.userId }],
  });
  if (!friendship) return res.status(404).json({ error: "Заявку не знайдено" });

  await friendship.deleteOne();
  res.status(204).end();
}

// Прибрати з друзів — може будь-яка зі сторін дружби.
export async function removeFriend(req, res) {
  const friendship = await Friendship.findOne({
    _id: req.params.id,
    status: "accepted",
    $or: [{ addresseeId: req.userId }, { requesterId: req.userId }],
  });
  if (!friendship) return res.status(404).json({ error: "Друга не знайдено" });

  await friendship.deleteOne();
  res.status(204).end();
}

// Позначити всі свої вхідні заявки переглянутими — викликається, коли
// на фронтенді відкривається дзвіночок сповіщень (TopBar.jsx).
export async function markRequestsSeen(req, res) {
  await Friendship.updateMany(
    { addresseeId: req.userId, status: "pending", seen: false },
    { seen: true }
  );
  res.status(204).end();
}
