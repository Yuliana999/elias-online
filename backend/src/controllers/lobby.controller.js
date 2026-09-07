import Lobby from "../models/Lobby.js";
import User from "../models/User.js";
import { genUniqueLobbyCode } from "../utils/id.js";
import { createGame } from "../game/engine.js";
import { setGame } from "../game/store.js";
import { emitGameState, emitLobbyUpdate, emitLobbyStarted, emitLobbyKicked } from "../sockets/index.js";
import {
  MAX_TEAM_SIZE,
  MAX_PAIRS_LOBBY_SIZE,
  MAX_TEAM_LOBBY_SIZE,
  MIN_TEAM_COUNT,
  TEAM_KEYS,
  requiredTeamCount,
} from "../config/constants.js";

// Надсилає свіжий стан лобі всім, хто в кімнаті `lobby:<code>` —
// персоналізовано для кожного сокета (див. emitLobbyUpdate).
function broadcastLobby(req, lobby) {
  const io = req.app.get("io");
  emitLobbyUpdate(io, lobby);
}

// Скільки команд реально активно в цьому лобі. "pairs" завжди рівно про
// дві сторони (A/B). "team" дозволяє капітану обрати 2-4 (updateSettings
// нижче), а "custom" тепер росте автоматично разом із кількістю гравців
// (joinLobby нижче) — в обох випадках це lobby.teamCount.
function activeTeamCount(lobby) {
  return lobby.mode === "team" || lobby.mode === "custom" ? lobby.teamCount || MIN_TEAM_COUNT : MIN_TEAM_COUNT;
}

// Ключі активних команд ("A","B" або й "C","D") для цього лобі.
function activeTeamKeys(lobby) {
  return TEAM_KEYS.slice(0, activeTeamCount(lobby));
}

function teamField(key) {
  return `team${key}`;
}

function getTeamArray(lobby, key) {
  return lobby[teamField(key)] || [];
}

// Максимум гравців у лобі РАЗОМ (розподілених по командах + "без
// команди"). У "team" залежить від того, скільки команд обрав капітан.
function maxLobbySizeFor(lobby) {
  if (lobby.mode === "pairs") return MAX_PAIRS_LOBBY_SIZE;
  if (lobby.mode === "team") return MAX_TEAM_SIZE * activeTeamCount(lobby);
  // "custom" — верхня межа на випадок усіх MAX_TEAM_COUNT команд; сама
  // кількість команд (і разом із тим фактичний ліміт) росте поступово
  // в joinLobby нижче, тож тут завжди перевіряємо саме на цей максимум.
  return MAX_TEAM_LOBBY_SIZE;
}

export async function createLobby(req, res) {
  // mode/roundDuration/totalRounds/genre/wordsPerTeam/scoring вже перевірені мідлваром validate(createLobbySchema)
  const { mode, roundDuration, totalRounds, genre, wordsPerTeam, scoring, teamCount } = req.body;

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
    // teamCount діє лише в "team" — капітан може обрати 2-4 команди.
    ...(mode === "team" && teamCount ? { teamCount } : {}),
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
    // У "team" він залежить від того, скільки команд обрав капітан
    // (lobby.teamCount) — інакше зайві гравці ніколи не потраплять у
    // жодну команду, бо всі команди вже заповнені.
    if (lobby.mode === "team" || lobby.mode === "custom") {
      const max = maxLobbySizeFor(lobby);
      if (lobby.players.length >= max) {
        return res.status(409).json({
          error: `Лобі вже заповнене (максимум ${max} гравців)`,
        });
      }
    }
    lobby.players.push({ id: user.publicId, name: user.name });

    // "custom" не має ручного вибору кількості команд (на відміну від
    // "team") — вона підлаштовується сама під кількість гравців у лобі.
    // Росте лише вгору: якщо гравець вийде, вже розподілених по командах
    // людей ми не хочемо "губити", тому teamCount ніколи не зменшуємо тут.
    if (lobby.mode === "custom") {
      const needed = requiredTeamCount(lobby.players.length);
      if (needed > (lobby.teamCount || MIN_TEAM_COUNT)) {
        lobby.teamCount = needed;
      }
    }

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
  // Команда має існувати для цього лобі — "team" з teamCount=2 не має
  // команди C/D, "pairs"/"custom" мають лише A/B.
  if (!activeTeamKeys(lobby).includes(team)) {
    return res.status(400).json({ error: "Такої команди немає в цьому лобі" });
  }

  // Ліміт на команду: максимум MAX_TEAM_SIZE гравців. Гравця, який уже
  // в цій команді, дозволяємо "переприсвоїти" (нічого не зміниться), але
  // нового понад ліміт — ні.
  const targetTeam = getTeamArray(lobby, team);
  const alreadyInTargetTeam = targetTeam.includes(playerId);
  if (!alreadyInTargetTeam && targetTeam.length >= MAX_TEAM_SIZE) {
    return res.status(409).json({
      error: `У команді вже максимум гравців (${MAX_TEAM_SIZE})`,
    });
  }

  for (const key of TEAM_KEYS) {
    lobby[teamField(key)] = getTeamArray(lobby, key).filter((id) => id !== playerId);
  }
  lobby[teamField(team)].push(playerId);

  await lobby.save();
  broadcastLobby(req, lobby);
  res.json({ lobby: lobby.toPublicJSON(req.userId) });
}

export async function updateSettings(req, res) {
  // roundDuration/totalRounds/genre/wordsPerTeam/scoring/teamCount вже перевірені мідлваром validate(settingsSchema)
  const { roundDuration, totalRounds, genre, wordsPerTeam, scoring, teamCount } = req.body;

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
  if (teamCount && lobby.mode === "team" && teamCount !== lobby.teamCount) {
    lobby.teamCount = teamCount;
    // Якщо капітан зменшив кількість команд, гравці з командами, яких
    // уже немає (напр. C/D при переході з 4 на 2), стають "без команди"
    // — а не пропадають і не лишаються в неіснуючій команді.
    const keptKeys = TEAM_KEYS.slice(0, teamCount);
    for (const key of TEAM_KEYS) {
      if (!keptKeys.includes(key)) lobby[teamField(key)] = [];
    }
  }

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

  if (!activeTeamKeys(lobby).includes(team)) {
    return res.status(400).json({ error: "Такої команди немає в цьому лобі" });
  }
  const teamIds = getTeamArray(lobby, team);
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

  const team = activeTeamKeys(lobby).find((key) => getTeamArray(lobby, key).includes(req.userId)) || null;
  if (!team) {
    return res.status(400).json({ error: "Спочатку приєднайся до команди" });
  }

  // Кожен гравець команди пише свій список окремо — вони НЕ перезаписують
  // один одного, а об'єднуються (lobby.wordsForTeam) в спільний пул для
  // суперника. Тож тут більше не вимагаємо, щоб один-єдиний гравець
  // дотягнув до wordsPerTeam самотужки — це перевіряється по сумі
  // команди в startLobby нижче.
  lobby.submittedWordsByPlayer.set(req.userId, words);
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
      // Кожна активна команда (2-4, і в "team", і в "custom") повинна
      // мати хоча б одного гравця — інакше хід ніколи до неї не дійде
      // (turnTeamIdx крутиться по game.teams).
      : activeTeamKeys(lobby).every((key) => getTeamArray(lobby, key).length >= 1);
  if (!ready) {
    return res.status(400).json({ error: "Ще не всі готові до старту" });
  }
  if (lobby.mode === "custom") {
    const allReady = activeTeamKeys(lobby).every((key) => lobby.wordsForTeam(key).length >= lobby.wordsPerTeam);
    if (!allReady) {
      return res.status(400).json({ error: "Усі команди мають подати слова для наступної команди по колу" });
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
  for (const key of TEAM_KEYS) {
    lobby[teamField(key)] = getTeamArray(lobby, key).filter((id) => id !== playerId);
  }
  // Не обов'язково для коректності wordsForTeam (він і так фільтрує по
  // поточному складу команди), але прибираємо, щоб не тримати сирітські
  // дані кикнутого гравця в лобі.
  if (lobby.mode === "custom") {
    lobby.submittedWordsByPlayer.delete(playerId);
  }
  await lobby.save();

  const io = req.app.get("io");
  // Кикнутому гравцю — окрема подія (виводить його на меню з поясненням),
  // решті — звичайне оновлення складу лобі.
  emitLobbyKicked(io, lobby.code, playerId);
  broadcastLobby(req, lobby);
  res.json({ lobby: lobby.toPublicJSON(req.userId) });
}
