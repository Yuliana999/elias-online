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
function buildTeams(lobby) {
  const nameOf = (id) => lobby.players.find((p) => p.id === id)?.name || id;
  const teamAIds = lobby.teamA.length ? lobby.teamA : [lobby.players[0]?.id].filter(Boolean);
  // Гравці могли перейменувати свою команду в лобі (lobby.controller.js
  // #renameTeam) — якщо так, показуємо їхню назву, інакше дефолтна.
  const customNameA = lobby.teamNames?.A?.trim();
  const customNameB = lobby.teamNames?.B?.trim();

  // guessed/skipped — власний лічильник команди (окремо від team.score,
  // який дорівнює guessed, але лишається під старою назвою, щоб не
  // ламати фронтенд, який вже його малює). Потрібні для профілю гравця
  // зі статистикою: після завершення партії sockets/index.js#recordGameStats
  // додає ці числа кожному гравцю команди (User.stats.wordsGuessed/wordsMissed).
  const teams = [
    { id: "A", name: customNameA || "Команда 1", color: "coral", playerIds: teamAIds, players: teamAIds.map(nameOf), score: 0, guessed: 0, skipped: 0, explainerIdx: 0 },
  ];

  if ((lobby.mode === "team" || lobby.mode === "custom") && lobby.teamB.length) {
    teams.push({
      id: "B",
      name: customNameB || "Команда 2",
      color: "blue",
      playerIds: lobby.teamB,
      players: lobby.teamB.map(nameOf),
      score: 0,
      guessed: 0,
      skipped: 0,
      explainerIdx: 0,
    });
  } else {
    const restIds = lobby.players.map((p) => p.id).filter((id) => !teamAIds.includes(id));
    teams.push({
      id: "B",
      name: customNameB || (lobby.mode === "pairs" ? "Суперник" : "Команда 2"),
      color: "blue",
      playerIds: restIds,
      players: restIds.length ? restIds.map(nameOf) : ["Пара 2"],
      score: 0,
      guessed: 0,
      skipped: 0,
      explainerIdx: 0,
    });
  }

  return teams;
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
    // "Підставний суддя": команда A пояснює слова, які написала команда B
    // (і навпаки) — тож черга слів своя для кожної команди, а не одна
    // спільна, як у жанрових режимах.
    return {
      ...base,
      wordsByTeam: {
        A: shuffle(lobby.submittedWords?.B || []),
        B: shuffle(lobby.submittedWords?.A || []),
      },
      wordIdxByTeam: { A: 0, B: 0 },
    };
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
