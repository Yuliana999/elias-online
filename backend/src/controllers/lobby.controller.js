import Lobby from "../models/Lobby.js";
import User from "../models/User.js";
import { genUniqueLobbyCode } from "../utils/id.js";
import { createGame } from "../game/engine.js";
import { setGame } from "../game/store.js";
import { emitGameState, emitLobbyUpdate, emitLobbyStarted, emitLobbyKicked } from "../sockets/index.js";
import { MAX_TEAM_SIZE, MAX_PAIRS_LOBBY_SIZE, MAX_TEAM_LOBBY_SIZE } from "../config/constants.js";

// Надсилає свіжий стан лобі всім, хто в кімнаті `lobby:<code>` —
// персоналізовано для кожного сокета (див. emitLobbyUpdate).
function broadcastLobby(req, lobby) {
  const io = req.app.get("io");
  emitLobbyUpdate(io, lobby);
}

export async function createLobby(req, res) {
  // mode/roundDuration/totalRounds/genre/wordsPerTeam/scoring вже перевірені мідлваром validate(createLobbySchema)
  const { mode, roundDuration, totalRounds, genre, wordsPerTeam, scoring } = req.body;

  const captain = await User.findOne({ publicId: req.userId });
  if (!captain) return res.status(404).json({ error: "Користувача не знайдено" });

  const code = await genUniqueLobbyCode(Lobby);
  const lobby = await Lobby.create({
    code,
    mode,
    captainId: captain.publicId,
    players: [{ id: captain.publicId, name: captain.name }],
    ...(roundDuration ? { roundDuration } : {}),
    ...(totalRounds ? { totalRounds } : {}),
    ...(genre ? { genre } : {}),
    ...(mode === "custom" && wordsPerTeam ? { wordsPerTeam } : {}),
    ...(scoring ? { scoring } : {}),
  });

  res.status(201).json({ lobby: lobby.toPublicJSON(req.userId) });
}

export async function getLobby(req, res) {
  const lobby = await Lobby.findOne({ code: req.params.code.toUpperCase() });
  if (!lobby) return res.status(404).json({ error: "Лобі не знайдено" });
  res.json({ lobby: lobby.toPublicJSON(req.userId) });
}

export async function joinLobby(req, res) {
  const lobby = await Lobby.findOne({ code: req.params.code.toUpperCase() });
  if (!lobby) return res.status(404).json({ error: "Лобі не знайдено" });
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "Гра в цьому лобі вже почалась" });
  }

  const user = await User.findOne({ publicId: req.userId });
  if (!user) return res.status(404).json({ error: "Користувача не знайдено" });

  const alreadyIn = lobby.players.some((p) => p.id === user.publicId);
  if (!alreadyIn) {
    // Режим "pairs" — це завжди рівно 1 на 1 (капітан + один друг), тож
    // тут ліміт лобі стоїть одразу на приєднанні, а не лише на команді.
    if (lobby.mode === "pairs" && lobby.players.length >= MAX_PAIRS_LOBBY_SIZE) {
      return res.status(409).json({ error: "У грі в парах лобі вже заповнене (максимум 2 гравці)" });
    }
    // "team"/"custom" — ліміт на команду (MAX_TEAM_SIZE) не обмежує тих,
    // хто ще "без команди", тож перевіряємо ще й загальний розмір лобі.
    if (
      (lobby.mode === "team" || lobby.mode === "custom") &&
      lobby.players.length >= MAX_TEAM_LOBBY_SIZE
    ) {
      return res.status(409).json({
        error: `Лобі вже заповнене (максимум ${MAX_TEAM_LOBBY_SIZE} гравців)`,
      });
    }
    lobby.players.push({ id: user.publicId, name: user.name });
    await lobby.save();
  }

  broadcastLobby(req, lobby);
  res.json({ lobby: lobby.toPublicJSON(req.userId) });
}

export async function assignTeam(req, res) {
  // playerId/team вже перевірені мідлваром validate(assignTeamSchema)
  const { playerId, team } = req.body;

  const lobby = await Lobby.findOne({ code: req.params.code.toUpperCase() });
  if (!lobby) return res.status(404).json({ error: "Лобі не знайдено" });
  if (lobby.captainId !== req.userId) {
    return res.status(403).json({ error: "Лише капітан може розподіляти команди" });
  }
  if (!lobby.players.some((p) => p.id === playerId)) {
    return res.status(400).json({ error: "Цього гравця немає в лобі" });
  }

  // Ліміт на команду: максимум MAX_TEAM_SIZE гравців. Гравця, який уже
  // в цій команді, дозволяємо "переприсвоїти" (нічого не зміниться), але
  // нового понад ліміт — ні.
  const targetTeam = team === "A" ? lobby.teamA : lobby.teamB;
  const alreadyInTargetTeam = targetTeam.includes(playerId);
  if (!alreadyInTargetTeam && targetTeam.length >= MAX_TEAM_SIZE) {
    return res.status(409).json({
      error: `У команді вже максимум гравців (${MAX_TEAM_SIZE})`,
    });
  }

  lobby.teamA = lobby.teamA.filter((id) => id !== playerId);
  lobby.teamB = lobby.teamB.filter((id) => id !== playerId);
  if (team === "A") lobby.teamA.push(playerId);
  if (team === "B") lobby.teamB.push(playerId);

  await lobby.save();
  broadcastLobby(req, lobby);
  res.json({ lobby: lobby.toPublicJSON(req.userId) });
}

export async function updateSettings(req, res) {
  // roundDuration/totalRounds/genre/wordsPerTeam/scoring вже перевірені мідлваром validate(settingsSchema)
  const { roundDuration, totalRounds, genre, wordsPerTeam, scoring } = req.body;

  const lobby = await Lobby.findOne({ code: req.params.code.toUpperCase() });
  if (!lobby) return res.status(404).json({ error: "Лобі не знайдено" });
  if (lobby.captainId !== req.userId) {
    return res.status(403).json({ error: "Лише капітан може змінювати налаштування" });
  }
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "Гра вже почалась" });
  }

  if (roundDuration) lobby.roundDuration = roundDuration;
  if (totalRounds) lobby.totalRounds = totalRounds;
  if (genre) lobby.genre = genre;
  if (wordsPerTeam && lobby.mode === "custom") lobby.wordsPerTeam = wordsPerTeam;
  if (scoring) lobby.scoring = scoring;

  await lobby.save();
  broadcastLobby(req, lobby);
  res.json({ lobby: lobby.toPublicJSON(req.userId) });
}

// Гравець перейменовує СВОЮ команду (не обов'язково капітан — будь-хто
// з учасників команди) до старту гри. Порожнє ім'я = скинути на дефолтну
// назву ("Команда 1"/"Команда 2"), яку тоді підставить buildTeams.
export async function renameTeam(req, res) {
  // team/name вже перевірені мідлваром validate(renameTeamSchema)
  const { team, name } = req.body;

  const lobby = await Lobby.findOne({ code: req.params.code.toUpperCase() });
  if (!lobby) return res.status(404).json({ error: "Лобі не знайдено" });
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "Гру вже почато, перейменувати команду більше не можна" });
  }

  const teamIds = team === "A" ? lobby.teamA : lobby.teamB;
  if (!teamIds.includes(req.userId)) {
    return res.status(403).json({ error: "Перейменувати команду може лише той, хто в ній грає" });
  }

  lobby.teamNames[team] = name;
  await lobby.save();

  broadcastLobby(req, lobby);
  res.json({ lobby: lobby.toPublicJSON(req.userId) });
}

// Гравець подає (чи оновлює) список слів своєї команди — це слова, які
// пояснюватиме КОМАНДА-СУПЕРНИК. Дозволено лише учасникам призначеної
// команди, і лише поки лобі не стартувало (щоб не міняти слова на ходу).
export async function submitWords(req, res) {
  // words вже перевірені мідлваром validate(submitWordsSchema): масив
  // непорожніх рядків без дублікатів.
  const { words } = req.body;

  const lobby = await Lobby.findOne({ code: req.params.code.toUpperCase() });
  if (!lobby) return res.status(404).json({ error: "Лобі не знайдено" });
  if (lobby.mode !== "custom") {
    return res.status(400).json({ error: "Слова подаються лише в режимі «Підставний суддя»" });
  }
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "Гра вже почалась" });
  }

  const team = lobby.teamA.includes(req.userId) ? "A" : lobby.teamB.includes(req.userId) ? "B" : null;
  if (!team) {
    return res.status(400).json({ error: "Спочатку приєднайся до команди" });
  }
  if (words.length < lobby.wordsPerTeam) {
    return res.status(400).json({ error: `Потрібно щонайменше ${lobby.wordsPerTeam} слів` });
  }

  lobby.submittedWords[team] = words;
  await lobby.save();

  broadcastLobby(req, lobby);
  res.json({ lobby: lobby.toPublicJSON(req.userId) });
}

export async function startLobby(req, res) {
  const lobby = await Lobby.findOne({ code: req.params.code.toUpperCase() });
  if (!lobby) return res.status(404).json({ error: "Лобі не знайдено" });
  if (lobby.captainId !== req.userId) {
    return res.status(403).json({ error: "Лише капітан може почати гру" });
  }

  const ready =
    lobby.mode === "pairs"
      ? lobby.players.length >= 1
      : lobby.teamA.length >= 1 && lobby.teamB.length >= 1;
  if (!ready) {
    return res.status(400).json({ error: "Ще не всі готові до старту" });
  }
  if (lobby.mode === "custom") {
    const aReady = lobby.submittedWords.A.length >= lobby.wordsPerTeam;
    const bReady = lobby.submittedWords.B.length >= lobby.wordsPerTeam;
    if (!aReady || !bReady) {
      return res.status(400).json({ error: "Обидві команди мають подати слова для суперника" });
    }
  }

  lobby.status = "started";
  await lobby.save();

  // Сервер одразу створює авторитетний стан гри (спільний порядок слів,
  // рахунок, хід) — окрема подія "game:state" йде за "lobby:started",
  // щоб екран гри в усіх учасників малював те саме з першої секунди.
  const game = createGame(lobby);
  setGame(lobby.code, game);

  const io = req.app.get("io");
  // Персоналізовано (як і lobby:update) — у режимі "custom" toPublicJSON
  // все одно не показує чужі слова, але тримаємось однієї схеми.
  emitLobbyStarted(io, lobby);
  // Персоналізовано: слово бачить лише команда, чий зараз хід (див. sockets/index.js)
  emitGameState(io, game);
  res.json({ lobby: lobby.toPublicJSON(req.userId) });
}

// Рейтинг гравців у межах цього лобі — по накопиченій статистиці акаунту
// (User.stats), а не по поточній партії (для рахунку поточної гри вже є
// екран Results). Корисно побачити ще в лобі, до старту: хто з друзів
// найдосвідченіший/найточніший. Сортуємо за % вгаданих слів, тоді за
// кількістю зіграних ігор — щоб один щасливий вгаданий стрік новачка не
// обійшов досвідченого гравця з такою ж точністю.
export async function getLeaderboard(req, res) {
  const lobby = await Lobby.findOne({ code: req.params.code.toUpperCase() });
  if (!lobby) return res.status(404).json({ error: "Лобі не знайдено" });

  const ids = lobby.players.map((p) => p.id);
  const users = await User.find({ publicId: { $in: ids } }).select("publicId name stats");

  const rows = users.map((u) => {
    const { gamesPlayed = 0, wordsGuessed = 0, wordsMissed = 0 } = u.stats || {};
    const attempts = wordsGuessed + wordsMissed;
    return {
      id: u.publicId,
      name: u.name,
      gamesPlayed,
      accuracy: attempts > 0 ? Math.round((wordsGuessed / attempts) * 100) : 0,
    };
  });

  rows.sort((a, b) => b.accuracy - a.accuracy || b.gamesPlayed - a.gamesPlayed);
  res.json({ leaderboard: rows });
}

// Капітан прибирає гравця з лобі (напр. зайшов помилково або відвалився
// й більше не повертається). Дозволено лише поки лобі не стартувало —
// після старту партія вже рахує teams/playerIds, і "вигнати" когось
// звідти означало б переписувати активну гру на ходу.
export async function kickPlayer(req, res) {
  const { playerId } = req.params;

  const lobby = await Lobby.findOne({ code: req.params.code.toUpperCase() });
  if (!lobby) return res.status(404).json({ error: "Лобі не знайдено" });
  if (lobby.captainId !== req.userId) {
    return res.status(403).json({ error: "Лише капітан може прибирати гравців з лобі" });
  }
  if (lobby.status !== "waiting") {
    return res.status(409).json({ error: "Гра вже почалась, прибрати гравця не можна" });
  }
  if (playerId === req.userId) {
    return res.status(400).json({ error: "Не можна прибрати самого себе" });
  }
  if (!lobby.players.some((p) => p.id === playerId)) {
    return res.status(404).json({ error: "Такого гравця немає в лобі" });
  }

  lobby.players = lobby.players.filter((p) => p.id !== playerId);
  lobby.teamA = lobby.teamA.filter((id) => id !== playerId);
  lobby.teamB = lobby.teamB.filter((id) => id !== playerId);
  await lobby.save();

  const io = req.app.get("io");
  // Кикнутому гравцю — окрема подія (виводить його на меню з поясненням),
  // решті — звичайне оновлення складу лобі.
  emitLobbyKicked(io, lobby.code, playerId);
  broadcastLobby(req, lobby);
  res.json({ lobby: lobby.toPublicJSON(req.userId) });
}
