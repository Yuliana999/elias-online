import { useState, useEffect } from "react";
import { api, getAccessToken, setAccessToken, setSessionExpiredHandler } from "./api/http.js";
import { connectSocket, disconnectSocket, getSocket } from "./api/socket.js";
import { WORD_BANKS } from "./data/wordBanks.js";
import { shuffle } from "./utils/gameHelpers.js";

import Landing from "./components/Landing.jsx";
import Auth from "./components/Auth.jsx";
import Menu from "./components/Menu.jsx";
import SoloSetup from "./components/SoloSetup.jsx";
import Lobby from "./components/Lobby.jsx";
import Game from "./components/Game.jsx";
import Results from "./components/Results.jsx";
import Toast from "./components/Toast.jsx";

const SOLO_COLORS = ["amber", "coral", "blue"];

import "./styles/app.css";

/* ------------------------------------------------------------------ */
/* Root                                                                 */
/* ------------------------------------------------------------------ */
export default function EliasPrototype() {
  const [screen, setScreen] = useState("checking"); // 'checking' поки відновлюємо сесію
  const [authMode, setAuthMode] = useState("register");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [user, setUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false); // грає без акаунту — лише одиночний pass-and-play
  const [mode, setMode] = useState(null); // 'solo' | 'pairs' | 'team'
  const [lobby, setLobby] = useState(null);
  const [game, setGame] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [menuNotice, setMenuNotice] = useState(""); // напр. "капітан прибрав тебе з лобі"
  // Спливаюче вікно НАГОРІ екрана — на відміну від menuNotice (яке видно
  // лише на екрані меню), це видно на будь-якому екрані: рендериться поза
  // блоком screen === ... нижче.
  const [toast, setToast] = useState(null); // { text, kind: "info" | "warning" } | null

  const goto = (s) => setScreen(s);

  // При завантаженні сторінки пробуємо відновити сесію: якщо є
  // access-токен (або живий refresh-кукі), питаємо /api/auth/me.
  useEffect(() => {
    (async () => {
      if (!getAccessToken()) {
        const refreshed = await api.refresh();
        if (!refreshed) return goto("landing");
      }
      try {
        const { user: me } = await api.me();
        setUser({ id: me.id, name: me.name, stats: me.stats });
        goto("menu");
      } catch {
        setAccessToken(null);
        goto("landing");
      }
    })();
  }, []);

  // Реєструємо ОДИН раз: спрацьовує з будь-якого місця (лобі, профіль,
  // деки тощо), щойно apiRequest виявляє, що сесія більше не жива (401
  // навіть після спроби refresh). Чистимо локальний стан і показуємо
  // спливаюче вікно нагорі — а не просто мовчки редиректимо на landing.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      disconnectSocket();
      setAccessToken(null);
      setUser(null);
      setIsGuest(false);
      setLobby(null);
      setMode(null);
      setGame(null);
      setToast({ text: "Сесію завершено — увійди в акаунт знову.", kind: "warning" });
      goto("landing");
    });
  }, []);

  const startGame = ({ teams, roundDuration = 60, genre = "general", totalRounds = 3, scoring = "classic" }) => {
    const bank = WORD_BANKS[genre] || WORD_BANKS.general;
    setGame({
      teams,
      round: 1,
      totalRounds,
      turnTeamIdx: 0,
      words: shuffle(bank),
      wordIdx: 0,
      roundDuration,
      genre,
      scoring,
      timeLeft: roundDuration,
      running: false,
      guessed: 0,
      skipped: 0,
    });
  };

  const handleAuth = async (name, password) => {
    setAuthError("");
    setAuthBusy(true);
    try {
      const { user: me, accessToken } =
        authMode === "register" ? await api.register(name, password) : await api.login(name, password);
      setAccessToken(accessToken);
      setUser({ id: me.id, name: me.name, stats: me.stats });
      setIsGuest(false);
      goto("menu");
    } catch (err) {
      setAuthError(err.message || "Щось пішло не так");
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // навіть якщо запит не вдався, все одно чистимо локальну сесію
    }
    disconnectSocket();
    setAccessToken(null);
    setUser(null);
    setIsGuest(false);
    setToast({ text: "Ти вийшов з акаунту.", kind: "info" });
    goto("landing");
  };

  // Підписка на realtime-події поточного лобі: доки лобі відкрите, всі
  // учасники бачать зміни складу/налаштувань. Старт гри (капітаном) шле
  // "lobby:started" (перехід екрана) одразу за яким летить "game:state" —
  // сервер сам порахував команди/слова/рахунок, клієнт лише малює це.
  useEffect(() => {
    if (!lobby) return;
    const socket = connectSocket();
    const joinRoom = () => socket.emit("lobby:join", lobby.code);
    joinRoom();
    // Якщо сокет перепідключився (короткий розрив зв'язку чи рестарт
    // сервера — див. backend/game/store.js#restoreGames), заходимо в
    // кімнату лобі заново: сервер одразу дошле поточний game:state,
    // якщо партія саме тоді була активна.
    socket.on("connect", joinRoom);

    const onUpdate = (updated) => setLobby(updated);
    const onStarted = (updated) => {
      setLobby(updated);
      goto("game");
    };
    const onGameState = (state) => setGame(state);
    const onGameTick = ({ timeLeft, running }) =>
      setGame((g) => (g ? { ...g, timeLeft, running } : g));
    const onGameFinished = (state) => {
      setGame(null);
      setLastResult({ teams: state.teams, guessed: state.guessed, skipped: state.skipped });
      goto("results");
    };
    // Капітан прибрав нас з лобі — виходимо на меню з поясненням.
    const onKicked = () => {
      setLobby(null);
      setMode(null);
      setGame(null);
      setMenuNotice("Капітан прибрав тебе з лобі.");
      goto("menu");
    };

    socket.on("lobby:update", onUpdate);
    socket.on("lobby:started", onStarted);
    socket.on("game:state", onGameState);
    socket.on("game:tick", onGameTick);
    socket.on("game:finished", onGameFinished);
    socket.on("lobby:kicked", onKicked);
    return () => {
      socket.off("connect", joinRoom);
      socket.off("lobby:update", onUpdate);
      socket.off("lobby:started", onStarted);
      socket.off("game:state", onGameState);
      socket.off("game:tick", onGameTick);
      socket.off("game:finished", onGameFinished);
      socket.off("lobby:kicked", onKicked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby?.code]);

  const chooseMode = async (m) => {
    setMode(m);
    if (m === "solo") {
      // одиночна гра — це pass-and-play для людей, які вже зустрілися
      // в реалі: не потрібне лобі, натомість перед стартом питаємо
      // скільки людей грає, скільки триває раунд і скільки буде кіл.
      goto("soloSetup");
      return;
    }
    // pairs & team modes go through a lobby first — реальне лобі на бекенді
    try {
      const { lobby: created } = await api.createLobby(m, 60, "general", 3, m === "custom" ? 5 : undefined);
      setLobby(created);
      goto("lobby");
    } catch (err) {
      setAuthError(err.message || "Не вдалося створити лобі");
      goto("menu");
    }
  };

  const startSolo = ({ teams: teamGroups, roundDuration, rounds, genre, scoring }) => {
    const teams = teamGroups.map((names, i) => ({
      name: names.length > 1 ? `Команда ${i + 1}` : names[0],
      color: SOLO_COLORS[i % SOLO_COLORS.length],
      players: names,
      score: 0,
      explainerIdx: 0,
    }));
    startGame({ teams, roundDuration, genre, totalRounds: rounds, scoring });
    goto("game");
  };

  // Гість — без акаунту й без бекенду. Ведемо одразу на налаштування
  // одиночної гри; лобі/команди/API тут не задіяні взагалі.
  const startGuestPlay = () => {
    setIsGuest(true);
    setMode("solo");
    goto("soloSetup");
  };

  const joinLobbyByCode = async (code) => {
    const { lobby: joined } = await api.joinLobby(code.trim().toUpperCase());
    setMode(joined.mode);
    setLobby(joined);
    goto("lobby");
  };

  const startFromLobby = async () => {
    // Сервер сам розішле "lobby:started" усім у кімнаті (включно з нами) —
    // саме на цю подію реагує ефект вище і запускає гру для кожного.
    await api.startLobby(lobby.code);
  };

  // Пари й команди грають через сервер (lobby/game сокет-події); соло —
  // повністю локально, як і раніше, без бекенду взагалі.
  const isOnlineGame = mode === "pairs" || mode === "team" || mode === "custom";
  const canAct = isOnlineGame && game && user
    ? !!game.teams[game.turnTeamIdx]?.playerIds?.includes(user.id)
    : true;
  // На відміну від canAct (дозволяє тапати кнопки будь-кому з поточної
  // команди), isExplainer вужчий: чи саме ЦЯ людина зараз пояснює слово
  // (за explainerIdx команди). Використовується лише для показу самого
  // слова (Game.jsx) — сервер і так ховає currentWord від усіх, крім
  // пояснювача (див. backend/game/engine.js#publicGameFor), але фронтенд
  // теж має розрізняти цей стан, щоб малювати правильну підказку
  // ("пояснюй" / "слухай і вгадуй" / хід суперника).
  const isExplainer = isOnlineGame && game && user
    ? game.teams[game.turnTeamIdx]?.playerIds?.[
        (game.teams[game.turnTeamIdx]?.explainerIdx || 0) %
          (game.teams[game.turnTeamIdx]?.playerIds?.length || 1)
      ] === user.id
    : true;

  const emitGame = (event, payload) => getSocket()?.emit(event, payload);

  const leaveLobby = () => {
    const socket = getSocket();
    socket?.emit("lobby:leave");
    setLobby(null);
    setMode(null);
    goto("menu");
  };

  const restart = () => {
    setMode(null);
    setLobby(null);
    setGame(null);
    setLastResult(null);
    goto(isGuest ? "landing" : "menu");
  };

  return (
    <div className="elias-app">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {screen === "checking" && <div className="screen center" />}
      {screen === "landing" && (
        <Landing
          onStart={(mode) => {
            setAuthMode(mode);
            goto("auth");
          }}
          onGuestPlay={startGuestPlay}
        />
      )}
      {screen === "auth" && (
        <Auth
          mode={authMode}
          setMode={setAuthMode}
          onAuth={handleAuth}
          onBack={() => goto("landing")}
          error={authError}
          busy={authBusy}
        />
      )}
      {screen === "menu" && user && (
        <Menu
          user={user}
          onChoose={chooseMode}
          onJoin={joinLobbyByCode}
          onLogout={logout}
          notice={menuNotice}
          onDismissNotice={() => setMenuNotice("")}
        />
      )}
      {screen === "soloSetup" && (
        <SoloSetup user={user} onStart={startSolo} onBack={() => goto(isGuest ? "landing" : "menu")} />
      )}
      {screen === "lobby" && lobby && (
        <Lobby
          mode={mode}
          user={user}
          lobby={lobby}
          onAssign={(playerId, team) => api.assignTeam(lobby.code, playerId, team)}
          onSettings={(patch) => api.updateLobbySettings(lobby.code, patch)}
          onRenameTeam={(team, name) => api.renameTeam(lobby.code, team, name)}
          onSubmitWords={(words) => api.submitWords(lobby.code, words)}
          onStart={startFromLobby}
          onBack={leaveLobby}
          onKick={(playerId) => api.kickPlayer(lobby.code, playerId)}
          onLoadLeaderboard={() => api.getLobbyLeaderboard(lobby.code)}
          onListDecks={api.listDecks}
          onSaveDeck={(name, words) => api.createDeck(name, words)}
          onDeleteDeck={(id) => api.deleteDeck(id)}
        />
      )}
      {screen === "game" && game && (
        <Game
          game={game}
          setGame={setGame}
          online={isOnlineGame}
          canAct={canAct}
          isExplainer={isExplainer}
          onStartTimer={() => emitGame("game:startTimer")}
          onGuess={(correct) => emitGame("game:guess", { correct })}
          onEndTurn={() => emitGame("game:endTurn")}
          onFinish={(result) => {
            // Соло-гра рахується локально (без лобі/сокетів) — якщо
            // граємо не як гість, а під акаунтом, best-effort шлемо
            // результат на бекенд, щоб він теж потрапив у профіль/статистику.
            // Помилку мережі тут навмисне ігноруємо: не варто зупиняти
            // перехід на екран результатів через це.
            if (!isGuest) {
              api.recordSoloResult(result.guessed, result.skipped).catch(() => {});
            }
            setLastResult(result);
            goto("results");
          }}
        />
      )}
      {screen === "results" && lastResult && (
        <Results
          result={lastResult}
          onRestart={restart}
          restartLabel={isGuest ? "На головну" : "До меню"}
          onPlayAgain={mode === "solo" ? () => { setLastResult(null); goto("soloSetup"); } : null}
        />
      )}
    </div>
  );
}
