import mongoose from "mongoose";

/*
  Дружба між двома гравцями. Один документ на пару, незалежно від напрямку:
  requesterId — хто надіслав заявку, addresseeId — хто отримав (обидва —
  publicId, як і скрізь у моделях, що показують id в API).

  status: "pending" — заявка чекає рішення адресата; "accepted" — вже друзі.
  Відхилену/скасовану заявку чи розірвану дружбу просто видаляємо (історію
  відмов не тримаємо) — так само, як капітан "прибирає" гравця з лобі
  (users.controller.js такого не робить, але дивись lobby.controller.js#kickPlayer
  для прикладу того самого підходу в цій кодовій базі).
*/
const friendshipSchema = new mongoose.Schema(
  {
    requesterId: { type: String, required: true, index: true },
    addresseeId: { type: String, required: true, index: true },
    status: { type: String, enum: ["pending", "accepted"], default: "pending", index: true },
    // Чи бачив адресат цю заявку в дзвінку зверху — скидається на true,
    // коли він відкриває список заявок (POST /api/friends/requests/seen).
    // Значення для friends.controller.js#listFriends: лише вхідні pending
    // заявки взагалі мають це поле сенс.
    seen: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Friendship", friendshipSchema);
