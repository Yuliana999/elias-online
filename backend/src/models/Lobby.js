import mongoose from "mongoose";
import { TEAM_KEYS, MIN_TEAM_COUNT } from "../config/constants.js";

/*
  Лобі живе недовго (одна ігрова сесія), тому зберігаємо його в Mongo
  просто щоб пережити рестарт бекенда й дати кільком інстансам сервера
  бачити один стан. Форма players/teamA/teamB навмисно повторює те, що
  вже малює фронтенд-мок (Lobby у App.jsx), щоб під'єднання було 1-в-1.
*/
const playerSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // publicId користувача
    name: { type: String, required: true },
  },
  { _id: false }
);

const lobbySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    // "custom" — режим "Підставний суддя": команди пишуть слова одна
    // одній замість вибору жанру (див. wordsPerTeam/submittedWordsByPlayer нижче).
    mode: { type: String, enum: ["pairs", "team", "custom"], required: true },
    captainId: { type: String, required: true },
    players: { type: [playerSchema], default: [] },
    teamA: { type: [String], default: [] }, // publicId гравців
    teamB: { type: [String], default: [] },
    // teamC/teamD існують у режимах "team" і "custom", коли активно 3 або
    // 4 команди (MIN_TEAM_COUNT/MAX_TEAM_COUNT у constants.js). У "team"
    // це обирає капітан, у "custom" — росте автоматично (joinLobby).
    // "pairs" завжди рівно про дві сторони, тому їх не має.
    teamC: { type: [String], default: [] },
    teamD: { type: [String], default: [] },
    // Скільки команд активно (2-4). У "team" це обирає капітан
    // (updateSettings), у "custom" — росте автоматично разом із кількістю
    // гравців і ніколи не зменшується (joinLobby). Ігнорується в "pairs" —
    // там завжди 2 (A/B).
    teamCount: { type: Number, enum: [2, 3, 4], default: 2 },
    // Назви команд, які учасники можуть задати самі до старту гри (див.
    // renameTeam у lobby.controller.js). Порожній рядок = дефолтна назва
    // ("Команда 1"/"Команда 2"/...), яку підставляє buildTeams в engine.js.
    teamNames: {
      A: { type: String, trim: true, maxlength: 24, default: "" },
      B: { type: String, trim: true, maxlength: 24, default: "" },
      C: { type: String, trim: true, maxlength: 24, default: "" },
      D: { type: String, trim: true, maxlength: 24, default: "" },
    },
    status: { type: String, enum: ["waiting", "started"], default: "waiting" },
    roundDuration: { type: Number, enum: [30, 45, 60, 90, 120], default: 60 },
    totalRounds: { type: Number, min: 1, max: 10, default: 3 },
    // Тип рахунку — незалежний від mode, доступний у "pairs"/"team"/"custom"
    // однаково (див. config/constants.js#SCORING_MODES). "classic" — рахунок
    // це просто кількість вгаданих слів; "hard" — бали даються за вгадане й
    // знімаються за скіп (engine.js/sockets/index.js#game:guess).
    scoring: { type: String, enum: ["classic", "hard"], default: "classic" },
    genre: {
      type: String,
      enum: ["general", "movies", "anime", "manga", "manhwa", "yaoi", "games", "animals", "food", "sport", "music", "geo", "science"],
      default: "general",
    },
    // Скільки слів має подати кожна команда в режимі "custom" — заміняє
    // вибір жанру, коли команди пишуть слова самі одна одній.
    wordsPerTeam: { type: Number, min: 5, max: 40, default: 5 },
    // Слова, які написав КОЖЕН гравець окремо (ключ — publicId гравця).
    // У команді може бути кілька гравців (до MAX_TEAM_SIZE) — раніше
    // останній, хто натиснув "Зберегти", перезаписував слова попереднього
    // тіммейта; тепер кожен пише свій список, і wordsForTeam нижче об'єднує
    // всіх учасників команди в один спільний пул для суперника.
    submittedWordsByPlayer: { type: Map, of: [String], default: () => new Map() },
  },
  { timestamps: true }
);

// Слова, які пояснюватиме команда `key` — зібрані з УСІХ гравців, хто
// зараз у цій команді (кожен пише свій список окремо в submitWords, вони
// не перезаписують один одного, а об'єднуються тут в один спільний пул
// для суперника). Дублікати між тіммейтами прибираємо (без урахування
// регістру), щоб те саме слово, назване двічі, не з'явилось у грі двічі.
lobbySchema.methods.wordsForTeam = function (key) {
  const ids = this[`team${key}`] || [];
  const words = [];
  const seen = new Set();
  for (const id of ids) {
    const own = this.submittedWordsByPlayer?.get?.(id) || [];
    for (const w of own) {
      const norm = w.trim();
      const lower = norm.toLowerCase();
      if (!norm || seen.has(lower)) continue;
      seen.add(lower);
      words.push(norm);
    }
  }
  return words;
};

// forUserId — публічний ID гравця, для якого формуємо відповідь. У режимі
// "custom" це важливо: гравець бачить лише те, скільки слів подала кожна
// команда (готовність), а самі слова свого супротивника — ні, інакше
// зникає весь сенс режиму (команда заздалегідь підгляне, що доведеться
// пояснювати). Власний список команди гравець бачить — щоб можна було
// звірити, що вже подали.
lobbySchema.methods.toPublicJSON = function (forUserId) {
  const base = {
    code: this.code,
    mode: this.mode,
    captainId: this.captainId,
    players: this.players,
    teamA: this.teamA,
    teamB: this.teamB,
    teamC: this.teamC,
    teamD: this.teamD,
    teamCount: this.mode === "team" || this.mode === "custom" ? this.teamCount : 2,
    teamNames: this.teamNames,
    status: this.status,
    roundDuration: this.roundDuration,
    totalRounds: this.totalRounds,
    genre: this.genre,
    scoring: this.scoring,
  };

  if (this.mode === "custom") {
    const activeKeys = TEAM_KEYS.slice(0, this.teamCount || MIN_TEAM_COUNT);

    base.wordsPerTeam = this.wordsPerTeam;
    base.wordsStatus = {};
    for (const key of activeKeys) {
      const count = this.wordsForTeam(key).length;
      base.wordsStatus[key] = { count, ready: count >= this.wordsPerTeam };
    }

    const myTeam = activeKeys.find((key) => (this[`team${key}`] || []).includes(forUserId)) || null;
    base.myTeam = myTeam;
    // Лише ВЛАСНИЙ внесок цього гравця (не весь пул команди) — форма
    // подачі слів (WordsSubmitForm) редагує список кожного окремо.
    base.myWords = this.submittedWordsByPlayer?.get?.(forUserId) || [];
  }

  return base;
};

export default mongoose.model("Lobby", lobbySchema);
