import mongoose from "mongoose";

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
    // одній замість вибору жанру (див. wordsPerTeam/submittedWords нижче).
    mode: { type: String, enum: ["pairs", "team", "custom"], required: true },
    captainId: { type: String, required: true },
    players: { type: [playerSchema], default: [] },
    teamA: { type: [String], default: [] }, // publicId гравців
    teamB: { type: [String], default: [] },
    // Назви команд, які учасники можуть задати самі до старту гри (див.
    // renameTeam у lobby.controller.js). Порожній рядок = дефолтна назва
    // ("Команда 1"/"Команда 2"), яку підставляє buildTeams в engine.js.
    teamNames: {
      A: { type: String, trim: true, maxlength: 24, default: "" },
      B: { type: String, trim: true, maxlength: 24, default: "" },
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
    // Слова, які кожна команда придумала для СУПЕРНИКА (не для себе):
    // submittedWords.A — слова від команди 1 (пояснюватиме їх команда 2),
    // submittedWords.B — слова від команди 2 (пояснюватиме їх команда 1).
    submittedWords: {
      A: { type: [String], default: [] },
      B: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);

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
    teamNames: this.teamNames,
    status: this.status,
    roundDuration: this.roundDuration,
    totalRounds: this.totalRounds,
    genre: this.genre,
    scoring: this.scoring,
  };

  if (this.mode === "custom") {
    base.wordsPerTeam = this.wordsPerTeam;
    base.wordsStatus = {
      A: { count: this.submittedWords.A.length, ready: this.submittedWords.A.length >= this.wordsPerTeam },
      B: { count: this.submittedWords.B.length, ready: this.submittedWords.B.length >= this.wordsPerTeam },
    };
    const myTeam = this.teamA.includes(forUserId) ? "A" : this.teamB.includes(forUserId) ? "B" : null;
    base.myTeam = myTeam;
    base.myWords = myTeam ? this.submittedWords[myTeam] : [];
  }

  return base;
};

export default mongoose.model("Lobby", lobbySchema);
