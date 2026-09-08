import { Server } from "socket.io";
import { verifyAccessToken } from "../utils/tokens.js";
import { getGame, deleteGame, persistGame } from "../game/store.js";
import { publicGame, publicGameFor, isOnCurrentTeam, currentExplainerId, advanceExplainer, advanceWordIdx } from "../game/engine.js";
import { HARD_MODE_GUESS_POINTS, HARD_MODE_SKIP_PENALTY } from "../config/constants.js";
import User from "../models/User.js";

/*
  Realtime-шар лобі й гри. Кожен сокет-клієнт після підключення явно каже,
  в якому лобі він сидить ("lobby:join"), і потрапляє в кімнату
  `lobby:<code>` — саме туди контролери лобі (lobby.controller.js)
  надсилають "lobby:update" / "lobby:started" після REST-запитів
  (join/team/start), тож усі учасники бачать зміни без перезавантаження.

  У тій самій кімнаті тепер живе й гра: сервер створює авторитетний стан
  гри при старті лобі (lobby.controller.js#startLobby), а звідси гравці
  керують ним подіями "game:startTimer" / "game:guess" / "game:endTurn".
  Дозволено діяти лише гравцям команди, чий зараз хід — інші пристрої
  просто дивляться той самий стан.
*/

// Всі сокети, що зараз сидять в кімнаті лобі. Стан гри в пам'яті одного
// процесу (store.js), тож тут можна брати живі Socket-об'єкти напряму,
// а не RemoteSocket через fetchSockets().
function socketsInRoom(io, code) {
  const ids = io.sockets.adapter.rooms.get(`lobby:${code}`);
  if (!ids) return [];
  return [...ids].map((id) => io.sockets.sockets.get(id)).filter(Boolean);
}

// Так само, як зі станом гри нижче: у режимі "custom" лобі не можна
// розсилати однаковим для всіх (toPublicJSON враховує forUserId, щоб
// ніхто не побачив слова, які пише суперник, до старту гри) — тож
// емітимо кожному сокету окремо, підставляючи саме його userId.
export function emitLobbyUpdate(io, lobby) {
  for (const socket of socketsInRoom(io, lobby.code)) {
    socket.emit("lobby:update", lobby.toPublicJSON(socket.userId));
  }
}

export function emitLobbyStarted(io, lobby) {
  for (const socket of socketsInRoom(io, lobby.code)) {
    socket.emit("lobby:started", lobby.toPublicJSON(socket.userId));
  }
}

// Кикнутому гравцю летить окрема подія (не просто оновлений lobby:update
// без нього в списку) — так фронтенд може одразу показати пояснення й
// вивести його на меню, а не просто мовчки лишити на екрані лобі.
// Опісля примусово прибираємо його сокет з кімнати, щоб він більше не
// отримував lobby:update/game:state цього лобі.
export function emitLobbyKicked(io, code, playerId) {
  for (const socket of socketsInRoom(io, code)) {
    if (socket.userId !== playerId) continue;
    socket.emit("lobby:kicked");
    socket.leave(`lobby:${code}`);
  }
}

// Особиста кімната гравця (user:<publicId>) — на відміну від lobby:<code>,
// сокет приєднується до неї автоматично при підключенні (нижче, в
// attachSockets), а не по явній події. Потрібна для нотифікацій, які не
// прив'язані до конкретного лобі (напр. заявки в друзі) — вони мають
// доходити незалежно від того, в якому лобі (чи поза ним) зараз гравець.
export function emitFriendRequest(io, toPublicId, request) {
  io.to(`user:${toPublicId}`).emit("friend:request", { request });
}

export function emitFriendAccepted(io, toPublicId, friend) {
  io.to(`user:${toPublicId}`).emit("friend:accepted", { friend });
}

// Нове особисте повідомлення (чат друзів — Chat.jsx). Так само летить лише
// в персональну кімнату отримувача: відправник вже має повідомлення
// локально (messages.controller.js#sendMessage повертає його як відповідь
// REST-запиту), дублювати йому через сокет не треба.
export function emitChatMessage(io, toPublicId, message) {
  io.to(`user:${toPublicId}`).emit("chat:message", { message });
}

// На відміну від lobby:update, стан гри шлють не однаковим для всіх —
// кожен сокет отримує currentWord лише якщо його гравець зараз у
// команді, чий хід (див. publicGameFor). Інакше суперник міг би просто
// побачити слово на своєму екрані, поки вгадує інша команда.
export function emitGameState(io, game) {
  for (const socket of socketsInRoom(io, game.code)) {
    socket.emit("game:state", publicGameFor(game, socket.userId));
  }
}

function broadcastGame(io, game) {
  emitGameState(io, game);
}

// Профіль гравця зі статистикою (User.stats) — рахуємо тут, а не в
// lobby.controller.js, бо саме тут стає відомо, що партія завершилась
// (round > totalRounds). Внесок гравця береться з команди, в якій він
// грав: гра не веде окремого лічильника "хто саме тапнув Вгадав" всередині
// команди (це спільна дія — див. коментар при explainerIdx в engine.js),
// тож усі учасники команди отримують однаковий внесок цієї партії.
// Fire-and-forget, як і persistGame: помилка запису для одного гравця не
// повинна ламати завершення гри для решти.
function recordGameStats(game) {
  for (const team of game.teams) {
    for (const playerId of team.playerIds || []) {
      User.updateOne(
        { publicId: playerId },
        {
          $inc: {
            "stats.gamesPlayed": 1,
            "stats.wordsGuessed": team.guessed || 0,
            "stats.wordsMissed": team.skipped || 0,
          },
        }
      ).catch((err) =>
        console.error(`[stats] не вдалось оновити статистику ${playerId}:`, err.message)
      );
    }
  }
}

// Сервер сам веде відлік часу (а не кожен клієнт окремо), щоб усі
// пристрої бачили однакові секунди без розсинхрону.
function startGameTimer(io, game) {
  if (game.interval) clearInterval(game.interval);
  game.running = true;
  if (!game.timeLeft) game.timeLeft = game.roundDuration;

  game.interval = setInterval(() => {
    game.timeLeft -= 1;
    if (game.timeLeft <= 0) {
      game.timeLeft = 0;
      game.running = false;
      clearInterval(game.interval);
      game.interval = null;
    }
    io.to(`lobby:${game.code}`).emit("game:tick", {
      timeLeft: game.timeLeft,
      running: game.running,
    });
  }, 1000);
}

export function attachSockets(httpServer, clientOrigin) {
  const io = new Server(httpServer, {
    cors: { origin: clientOrigin, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Потрібен токен авторизації"));

    try {
      const payload = verifyAccessToken(token);
      socket.userId = payload.sub; // publicId
      socket.userName = payload.name;
      next();
    } catch {
      next(new Error("Недійсний токен"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`[socket] підключився ${socket.userName} (${socket.userId})`);

    // Особиста кімната — сюди летять нотифікації про друзів (emitFriendRequest/
    // emitFriendAccepted вище), не прив'язані до конкретного лобі.
    socket.join(`user:${socket.userId}`);

    // Поточне лобі цього сокета (якщо є) — щоб коректно вийти з кімнати
    // і сповістити інших при "lobby:leave" чи розриві з'єднання.
    let currentLobbyCode = null;

    socket.on("lobby:join", (code) => {
      if (!code || typeof code !== "string") return;
      const roomCode = code.trim().toUpperCase();

      if (currentLobbyCode && currentLobbyCode !== roomCode) {
        socket.leave(`lobby:${currentLobbyCode}`);
      }

      currentLobbyCode = roomCode;
      socket.join(`lobby:${roomCode}`);
      console.log(`[socket] ${socket.userName} приєднався до кімнати lobby:${roomCode}`);

      // Якщо в цьому лобі вже йде партія (напр. сокет перепідключився
      // після короткого розриву зв'язку чи рестарту сервера — див.
      // game/store.js#restoreGames), одразу шлемо поточний стан гри,
      // щоб екран не завис на старому кадрі.
      const activeGame = getGame(roomCode);
      if (activeGame && !activeGame.finished) {
        socket.emit("game:state", publicGameFor(activeGame, socket.userId));
      }
    });

    socket.on("lobby:leave", () => {
      if (!currentLobbyCode) return;
      socket.leave(`lobby:${currentLobbyCode}`);
      console.log(`[socket] ${socket.userName} покинув кімнату lobby:${currentLobbyCode}`);
      currentLobbyCode = null;
    });

    // --- Гра: усі дії перевіряють, що це справді хід команди гравця,
    // який їх надсилає — інакше подія просто тихо ігнорується.
    socket.on("game:startTimer", () => {
      const game = getGame(currentLobbyCode);
      if (!game || game.finished || game.running) return;
      if (!isOnCurrentTeam(game, socket.userId)) return;
      startGameTimer(io, game);
    });

    socket.on("game:guess", (payload) => {
      const game = getGame(currentLobbyCode);
      if (!game || game.finished || !game.running) return;
      // Скіп/Вгадав тисне лише той, хто зараз пояснює (бачить слово) —
      // не будь-хто з команди, чий хід. Гравець, який слухає й вгадує,
      // такої кнопки в інтерфейсі вже не має (Game.jsx), але перевірку
      // дублюємо тут — інакше подію можна відправити напряму через сокет.
      if (socket.userId !== currentExplainerId(game)) return;

      const correct = !!payload?.correct;
      const team = game.teams[game.turnTeamIdx];
      // "classic": рахунок = кількість вгаданих слів (скіп на нього не
      // впливає). "hard": бали даються за вгадане й знімаються за скіп
      // (рахунок може піти в мінус) — див. config/constants.js.
      const isHard = game.scoring === "hard";
      if (correct) {
        team.score += isHard ? HARD_MODE_GUESS_POINTS : 1;
        team.guessed = (team.guessed || 0) + 1;
        game.guessed += 1;
      } else {
        if (isHard) team.score -= HARD_MODE_SKIP_PENALTY;
        team.skipped = (team.skipped || 0) + 1;
        game.skipped += 1;
      }
      advanceWordIdx(game);
      broadcastGame(io, game);
      // Знімок у Mongo — рахунок і прогрес по словах переживуть рестарт
      // сервера (див. game/store.js). Не блокує подію: помилка запису
      // лише логується, гра в пам'яті продовжується як є.
      persistGame(game);
    });

    socket.on("game:endTurn", () => {
      const game = getGame(currentLobbyCode);
      if (!game || game.finished) return;
      if (game.running || game.timeLeft > 0) return; // лише коли час дійсно вийшов
      if (!isOnCurrentTeam(game, socket.userId)) return;

      const wasLastTeam = game.turnTeamIdx === game.teams.length - 1;
      // Просуваємо пояснювача команди, чий хід щойно закінчився — тоді
      // наступного разу, коли черга дійде знову до цієї команди, слово
      // пояснюватиме вже інший гравець, а не завжди перший у списку.
      advanceExplainer(game.teams[game.turnTeamIdx]);
      game.turnTeamIdx = (game.turnTeamIdx + 1) % game.teams.length;
      game.timeLeft = game.roundDuration;
      game.running = false;
      if (wasLastTeam) game.round += 1;

      if (game.round > game.totalRounds) {
        game.finished = true;
        io.to(`lobby:${game.code}`).emit("game:finished", publicGame(game));
        recordGameStats(game); // оновлює профіль/статистику кожного гравця
        deleteGame(game.code); // прибирає й знімок у Mongo — партія завершена
        return;
      }
      broadcastGame(io, game);
      persistGame(game);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[socket] відключився ${socket.userName}: ${reason}`);
      // Кімнату socket.io покидає автоматично — тут просто прибираємо стан.
      currentLobbyCode = null;
    });
  });

  return io;
}
