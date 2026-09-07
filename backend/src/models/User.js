import mongoose from "mongoose";

/*
  publicId — короткий ID у стилі фронтенду (напр. F7K2QW), який гравці
  називають один одному, щоб приєднатись до лобі. Він відрізняється
  від внутрішнього _id, який лишається технічним і в UI не показується.
*/
const userSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    // Нормалізована (нижній регістр) версія імені — по ній логінимось і
    // перевіряємо унікальність, щоб "Ім'я" і "ім'я" не вважались різними
    // акаунтами, а пошук при вході не залежав від регістру.
    nameKey: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    refreshTokenHash: { type: String, default: null },
    // Проста накопичувальна статистика гравця — оновлюється сервером після
    // кожної завершеної онлайн-партії (sockets/index.js#recordGameStats) і
    // після одиночної гри (users.controller.js#recordSoloResult). wordsGuessed/
    // wordsMissed рахуються по командному внеску гравця (спільна дія
    // команди — див. коментар при explainerIdx в engine.js), а не по тому,
    // хто саме тапнув "вгадав" — окремого лічильника на гравця в межах
    // команди гра не веде.
    stats: {
      gamesPlayed: { type: Number, default: 0 },
      wordsGuessed: { type: Number, default: 0 },
      wordsMissed: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

userSchema.methods.toPublicJSON = function () {
  const { gamesPlayed = 0, wordsGuessed = 0, wordsMissed = 0 } = this.stats || {};
  const attempts = wordsGuessed + wordsMissed;
  return {
    id: this.publicId,
    name: this.name,
    createdAt: this.createdAt,
    stats: {
      gamesPlayed,
      wordsGuessed,
      wordsMissed,
      // % вгаданих слів серед усіх спроб (вгадано + скіпнуто) — 0, якщо
      // гравець ще жодного слова не пояснював/вгадував.
      accuracy: attempts > 0 ? Math.round((wordsGuessed / attempts) * 100) : 0,
    },
  };
};

export default mongoose.model("User", userSchema);
