import { WORD_BANKS } from "../data/wordBanks.js";

/*
  Тут живе вся логіка партії (пари/команди), яка раніше рахувалась окремо
  на кожному пристрої (Game.jsx). Тепер сервер — єдине джерело правди:
  один спільний порядок слів, один рахунок, один таймер. Клієнти лише
  малюють те, що прилітає в "game:state" / "game:tick", і шлють дії
  ("game:startTimer" / "game:guess" / "game:endTurn").

  Стан гри як і раніше живе в пам'яті процесу під час гри (див.
  store.js) заради швидкості — але тепер кожна суттєва зміна додатково
  зберігається "знімком" у Mongo (GameState), тож рестарт сервера
  посеред партії вже не стирає рахунок і прогрес по словах повністю
  (деталі — коментар на початку store.js).
*/

export const TOTAL_ROUNDS = 3;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Та сама розкладка на команди, що раніше рахував фронтенд у
// App.jsx#teamsFromLobby — лишаємо ідентичну, але тепер зі збереженням
// playerIds (публічних id), щоб сервер міг перевіряти, чий зараз хід.
// explainerIdx — індекс гравця команди, який пояснює цього ходу; так
// пояснювач ротується по колу, а не завжди перший у списку.
const TEAM_KEYS = ["A", "B", "C", "D"];
const TEAM_COLORS = { A: "coral", B: "blue", C: "amber", D: "mint" };
const TEAM_DEFAULT_NAMES = { A: "Команда 1", B: "Команда 2", C: "Команда 3", D: "Команда 4" };

function buildTeams(lobby) {
  const nameOf = (id) => lobby.players.find((p) => p.id === id)?.name || id;

  // "team" і "custom" дозволяють 2-4 команди (lobby.teamCount) — у "team"
  // це обирає капітан, у "custom" воно росте автоматично разом із
  // кількістю гравців (lobby.controller.js#joinLobby), але будуються
  // обидва режими однаково: рівно по тому, кого капітан розподілив
  // кнопками в teamA..teamD. "pairs" — окремий випадок нижче (завжди дві
  // сторони, з авто-розподілом, якщо капітан ще нікого не призначив).
  if (lobby.mode === "team" || lobby.mode === "custom") {
    const teamCount = lobby.teamCount || 2;
    return TEAM_KEYS.slice(0, teamCount).map((key) => {
      const ids = lobby[`team${key}`] || [];
      const customName = lobby.teamNames?.[key]?.trim();
      return {
        id: key,
        name: customName || TEAM_DEFAULT_NAMES[key],
        color: TEAM_COLORS[key],
        playerIds: ids,
        // guessed/skipped — власний лічильник команди (окремо від
        // team.score, який дорівнює guessed, але лишається під старою
        // назвою, щоб не ламати фронтенд, який вже його малює). Потрібні
        // для профілю гравця зі статистикою: після завершення партії
        // sockets/index.js#recordGameStats додає ці числа кожному
        // гравцю команди (User.stats.wordsGuessed/wordsMissed).
        players: ids.length ? ids.map(nameOf) : [TEAM_DEFAULT_NAMES[key]],
        score: 0,
        guessed: 0,
        skipped: 0,
        explainerIdx: 0,
      };
    });
  }

  // "pairs" — завжди рівно дві сторони (A/B), з авто-розподілом "решти"
  // гравців у команду B, якщо капітан ще нікого явно не призначив
  // (найпростіший сценарій "я і друг", без ручного розподілу).
  const teamAIds = lobby.teamA.length ? lobby.teamA : [lobby.players[0]?.id].filter(Boolean);
  const customNameA = lobby.teamNames?.A?.trim();
  const customNameB = lobby.teamNames?.B?.trim();
  const restIds = lobby.players.map((p) => p.id).filter((id) => !teamAIds.includes(id));

  return [
    { id: "A", name: customNameA || "Команда 1", color: "coral", playerIds: teamAIds, players: teamAIds.map(nameOf), score: 0, guessed: 0, skipped: 0, explainerIdx: 0 },
    {
      id: "B",
      name: customNameB || "Суперник",
      color: "blue",
      playerIds: restIds,
      players: restIds.length ? restIds.map(nameOf) : ["Пара 2"],
      score: 0,
      guessed: 0,
      skipped: 0,
      explainerIdx: 0,
    },
  ];
}

// Викликається, коли хід команди закінчується (endTurn) — просуває її
// власний покажчик пояснювача на наступного гравця по колу, щоб коли
// хід знову дійде до цієї команди, пояснював уже хтось інший.
export function advanceExplainer(team) {
  const size = team.players.length || 1;
  team.explainerIdx = ((team.explainerIdx || 0) + 1) % size;
}

// Ім'я гравця, який пояснює цього ходу в команді, чий зараз хід.
export function currentExplainerName(team) {
  if (!team || !team.players.length) return "";
  return team.players[(team.explainerIdx || 0) % team.players.length];
}

export function createGame(lobby) {
  const teams = buildTeams(lobby);
  const base = {
    code: lobby.code,
    mode: lobby.mode,
    roundDuration: lobby.roundDuration,
    // Капітан обирає кількість кіл у лобі (Lobby.jsx) — так само, як в
    // одиночній грі; якщо чомусь не задано, лишаємо старе значення за замовчуванням.
    totalRounds: lobby.totalRounds || TOTAL_ROUNDS,
    // Тип рахунку — незалежний від mode, тож доступний однаково в
    // pairs/team/custom (див. config/constants.js#SCORING_MODES). Реально
    // впливає на бали в sockets/index.js#game:guess.
    scoring: lobby.scoring || "classic",
    teams,
    turnTeamIdx: 0,
    round: 1,
    timeLeft: lobby.roundDuration,
    running: false,
    guessed: 0,
    skipped: 0,
    finished: false,
    interval: null,
  };

  if (lobby.mode === "custom") {
    // "Підставний суддя": кожна команда пояснює слова, які написала для
    // неї ПОПЕРЕДНЯ команда в списку — ланцюжком по колу (A→B→C→D→A).
    // Слова кожної команди — це об'єднаний пул усіх ЇЇ гравців
    // (lobby.wordsForTeam), а не слова від одного гравця, який останнім
    // натиснув "Зберегти". При 2 командах ланцюжок замикається на тих же
    // двох (A↔B), тобто це той самий сценарій "пара на пару", що й раніше.
    const keys = teams.map((t) => t.id);
    const wordsByTeam = {};
    const wordIdxByTeam = {};
    keys.forEach((key, i) => {
      const prevKey = keys[(i - 1 + keys.length) % keys.length];
      wordsByTeam[key] = shuffle(lobby.wordsForTeam(prevKey));
      wordIdxByTeam[key] = 0;
    });
    return { ...base, wordsByTeam, wordIdxByTeam };
  }

  const bank = WORD_BANKS[lobby.genre] || WORD_BANKS.general;
  return {
    ...base,
    genre: lobby.genre,
    words: shuffle(bank),
    wordIdx: 0,
  };
}

// Черга слів команди, чий зараз хід — у "custom" режимі кожна команда
// має власну (подану суперником), в інших режимах усі команди по черзі
// йдуть по одній спільній колоді (game.words).
function currentQueue(game) {
  if (game.mode === "custom") {
    return game.wordsByTeam[game.teams[game.turnTeamIdx].id] || [];
  }
  return game.words || [];
}

function currentIdx(game) {
  if (game.mode === "custom") {
    return game.wordIdxByTeam[game.teams[game.turnTeamIdx].id] || 0;
  }
  return game.wordIdx || 0;
}

// Просуває чергу слів після вгаданого/скіпнутого слова — саме тут
// розходяться режими: спільний лічильник vs окремий на команду.
export function advanceWordIdx(game) {
  if (game.mode === "custom") {
    const teamId = game.teams[game.turnTeamIdx].id;
    game.wordIdxByTeam[teamId] = (game.wordIdxByTeam[teamId] || 0) + 1;
  } else {
    game.wordIdx = (game.wordIdx || 0) + 1;
  }
}

// Те, що реально йде клієнтам: без internal-таймера (interval) і без
// повного списку слів (щоб опоненти не підглядали наперед) — лише
// поточне слово. Використовується там, де персоналізація не потрібна
// (напр. подія "game:finished" — партія вже завершена).
export function publicGame(game) {
  const { interval, words, wordsByTeam, ...rest } = game;
  const queue = currentQueue(game);
  const idx = currentIdx(game);
  return { ...rest, currentWord: queue.length ? queue[idx % queue.length] : null };
}

// Те саме, але для конкретного гравця: слово бачить ЛИШЕ той, чия зараз
// черга пояснювати (currentExplainerId нижче) — не вся команда. Якщо
// показувати слово ще й тому, хто вгадує, він міг би просто прочитати
// відповідь на своєму екрані замість слухати пояснення — а це вбиває
// сенс гри. Усім іншим (включно з тіммейтами-"вгадувачами") прилітає
// currentWord: null, а фронтенд малює це як "🙈".
export function publicGameFor(game, userId) {
  const { interval, words, wordsByTeam, ...rest } = game;
  const canSeeWord = userId === currentExplainerId(game);
  const queue = currentQueue(game);
  const idx = currentIdx(game);
  return { ...rest, currentWord: canSeeWord && queue.length ? queue[idx % queue.length] : null };
}

export function isOnCurrentTeam(game, userId) {
  const team = game.teams[game.turnTeamIdx];
  return !!team && team.playerIds.includes(userId);
}

// Публічний id гравця, який зараз пояснює (той самий explainerIdx, що і
// currentExplainerName, але як playerId) — потрібен саме для
// publicGameFor вище, щоб слово летіло конкретній людині, а не команді.
export function currentExplainerId(game) {
  const team = game.teams[game.turnTeamIdx];
  if (!team || !team.playerIds?.length) return null;
  return team.playerIds[(team.explainerIdx || 0) % team.playerIds.length];
}
