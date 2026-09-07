import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    id: String,
    name: String,
    color: String,
    playerIds: { type: [String], default: [] },
    players: { type: [String], default: [] },
    score: { type: Number, default: 0 },
    // Власний лічильник команди — джерело даних для профілю гравця зі
    // статистикою (див. коментар в engine.js#buildTeams).
    guessed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    explainerIdx: { type: Number, default: 0 },
  },
  { _id: false }
);

/*
  Знімок активної партії — резервна копія того, що зазвичай живе лише в
  пам'яті процесу (game/store.js), щоб рестарт сервера посеред гри не
  стирав рахунок і прогрес по словах повністю (див. коментар у
  store.js). Форма полів навмисно повторює game-об'єкт з engine.js:
  жанрові режими використовують words/wordIdx, "custom" — окремі
  wordsByTeam/wordIdxByTeam на команду (тому вони Mixed — форма різна
  залежно від режиму).

  Свідомо НЕ зберігаємо тут interval (не серіалізується) — після
  відновлення (server.js#restoreGames) running завжди false, гравцям
  доведеться самим натиснути "старт" ще раз.
*/
const gameStateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    mode: { type: String, required: true },
    roundDuration: { type: Number, required: true },
    totalRounds: { type: Number, required: true },
    scoring: { type: String, enum: ["classic", "hard"], default: "classic" },
    teams: { type: [teamSchema], default: [] },
    turnTeamIdx: { type: Number, default: 0 },
    round: { type: Number, default: 1 },
    timeLeft: { type: Number, default: 0 },
    running: { type: Boolean, default: false },
    guessed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    finished: { type: Boolean, default: false },
    // Жанрові режими (не "custom"):
    genre: { type: String },
    words: { type: [String] },
    wordIdx: { type: Number },
    // Режим "custom" ("Підставний суддя") — окрема черга слів на команду:
    wordsByTeam: { type: mongoose.Schema.Types.Mixed },
    wordIdxByTeam: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model("GameState", gameStateSchema);
