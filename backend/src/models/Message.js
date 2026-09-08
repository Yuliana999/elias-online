import mongoose from "mongoose";

/*
  Особисте повідомлення між двома гравцями (чат із друзями — Chat.jsx).
  На відміну від Friendship, тут один документ на кожне повідомлення, а не
  на пару: fromId/toId — publicId відправника й отримувача, як і скрізь у
  моделях, що показують id в API.

  readAt лишається null, поки отримувач не відкрив розмову (messages.controller.js
  #listConversation виставляє його при GET) — на цьому тримається бейдж
  непрочитаного на кнопці чату (Chat.jsx), так само як seen у Friendship
  тримає бейдж дзвіночка.
*/
const messageSchema = new mongoose.Schema(
  {
    fromId: { type: String, required: true, index: true },
    toId: { type: String, required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Основний запит контролера — вся переписка двох конкретних людей,
// відсортована за часом; складений індекс покриває обидва напрямки
// одразу через $or у запиті.
messageSchema.index({ fromId: 1, toId: 1, createdAt: 1 });

export default mongoose.model("Message", messageSchema);
