import { useEffect, useRef, useCallback, useState } from "react";
import { GENRES } from "../data/wordBanks.js";
import {
  isFeedbackEnabled,
  setFeedbackEnabled,
  playCorrect,
  playSkip,
  playTimeUp,
  vibrate,
  VIBRATE_CORRECT,
  VIBRATE_SKIP,
  VIBRATE_TIME_UP,
  VIBRATE_TAP,
} from "../utils/feedback.js";

const TIMER_RADIUS = 52;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;
const HISTORY_LIMIT = 6; // скільки останніх слів показуємо за хід

export default function Game({
  game,
  setGame,
  onFinish,
  online = false,
  canAct = true,
  isExplainer = true,
  onStartTimer,
  onGuess,
  onEndTurn,
}) {
  const intervalRef = useRef(null);
  const [feedbackOn, setFeedbackOn] = useState(isFeedbackEnabled);
  const [history, setHistory] = useState([]); // [{ word, correct }] — найновіше спереду
  const timeUpFiredRef = useRef(false);

  const toggleFeedback = () => {
    setFeedbackOn((v) => {
      setFeedbackEnabled(!v);
      return !v;
    });
  };

  useEffect(() => {
    // В онлайн-грі час рахує сервер і шле "game:tick" — свій інтервал
    // тут запускати не треба, інакше секунди подвояться.
    if (online) return;
    if (game.running) {
      intervalRef.current = setInterval(() => {
        setGame((g) => {
          if (g.timeLeft <= 1) {
            clearInterval(intervalRef.current);
            return { ...g, timeLeft: 0, running: false };
          }
          return { ...g, timeLeft: g.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [online, game.running, setGame]);

  const currentTeam = game.teams[game.turnTeamIdx];
  const explainerName = currentTeam.players[(currentTeam.explainerIdx || 0) % (currentTeam.players.length || 1)] || "";
  // Онлайн-стан не завжди містить "words" (сервер його не шле — див.
  // engine.js), а "currentWord" може бути навмисне null, коли слово
  // ховається від суперника — тому рахуємо резервне значення обережно.
  const currentWord = game.currentWord ?? (game.words ? game.words[game.wordIdx % game.words.length] : null);
  const timeUp = game.timeLeft === 0;

  const locked = online && !canAct;
  // Онлайн: слово бачить ЛИШЕ той, хто зараз пояснює (isExplainer) — не
  // вся команда. Сервер і так шле currentWord: null усім іншим (див.
  // backend/game/engine.js#publicGameFor), але цей прапорець дає
  // фронтенду розрізняти "чужий хід" від "мій хід, але я вгадую" —
  // для другого випадку показуємо іншу підказку нижче.
  const wordHidden = online && !isExplainer;
  // Гравець з поточної команди, який не пояснює цього ходу — тобто той,
  // хто слухає й вгадує. Йому кнопки активні (canAct), але слово ховаємо.
  const isGuessingTeammate = online && canAct && !isExplainer;

  // Історія — лише слова цього ходу: щойно хід передається іншій
  // команді (чи починається нове коло), список чистимо.
  useEffect(() => {
    setHistory([]);
  }, [game.turnTeamIdx, game.round]);

  // Звук + коротка вібрація рівно один раз у момент, коли час вийшов —
  // прапорець скидаємо, щойно починається новий відлік (timeLeft іде
  // від нуля), щоб той самий сигнал не спрацював двічі поспіль.
  useEffect(() => {
    if (timeUp && !timeUpFiredRef.current) {
      timeUpFiredRef.current = true;
      playTimeUp();
      vibrate(VIBRATE_TIME_UP);
    }
    if (!timeUp) timeUpFiredRef.current = false;
  }, [timeUp]);

  const nextWord = useCallback((delta, correct) => {
    // Фідбек одразу по кліку — не чекаємо підтвердження від сервера
    // (в онлайн-режимі це додало б відчутну затримку між дією і звуком).
    if (correct) {
      playCorrect();
      vibrate(VIBRATE_CORRECT);
    } else {
      playSkip();
      vibrate(VIBRATE_SKIP);
    }
    // У список останніх слів кладемо те, що людина щойно бачила на
    // екрані — якщо слово взагалі було видно (не команда суперника).
    if (!wordHidden && currentWord) {
      setHistory((h) => [{ word: currentWord, correct }, ...h].slice(0, HISTORY_LIMIT));
    }

    if (online) return onGuess?.(correct);
    setGame((g) => {
      // "classic": рахунок = кількість вгаданих слів (скіп на нього не
      // впливає). "hard": +1 бал за вгадане, −1 бал за скіп (рахунок
      // може піти в мінус) — ті самі правила, що й на сервері
      // (backend/src/sockets/index.js#game:guess).
      const isHard = g.scoring === "hard";
      const scoreDelta = correct ? 1 : isHard ? -1 : 0;
      const teams = g.teams.map((t, i) =>
        i === g.turnTeamIdx ? { ...t, score: t.score + scoreDelta } : t
      );
      return {
        ...g,
        teams,
        guessed: g.guessed + (correct ? 1 : 0),
        skipped: g.skipped + (correct ? 0 : delta),
        wordIdx: g.wordIdx + 1,
      };
    });
  }, [online, onGuess, setGame, wordHidden, currentWord]);

  const startTimer = () => {
    vibrate(VIBRATE_TAP);
    if (online) return onStartTimer?.();
    setGame((g) => ({ ...g, running: true, timeLeft: g.timeLeft || g.roundDuration }));
  };

  const endTurn = () => {
    if (online) return onEndTurn?.();
    if (game.teams.length > 1) {
      setGame((g) => {
        // Просуваємо пояснювача команди, чий хід закінчується, по колу —
        // так само, як на сервері (sockets/index.js#advanceExplainer).
        const teams = g.teams.map((t, i) => {
          if (i !== g.turnTeamIdx) return t;
          const size = t.players.length || 1;
          return { ...t, explainerIdx: ((t.explainerIdx || 0) + 1) % size };
        });
        return {
          ...g,
          teams,
          turnTeamIdx: (g.turnTeamIdx + 1) % g.teams.length,
          timeLeft: g.roundDuration,
          running: false,
          round: g.turnTeamIdx === g.teams.length - 1 ? g.round + 1 : g.round,
        };
      });
    } else {
      finishGame();
    }
  };

  const finishGame = () => {
    // Онлайн-фініш прилітає окремою подією "game:finished" від сервера —
    // тут нічого робити не треба.
    if (online) return;
    onFinish({ teams: game.teams, guessed: game.guessed, skipped: game.skipped });
  };

  const maxRounds = game.totalRounds || 3;
  const gameShouldEnd = !online && game.round > maxRounds;

  useEffect(() => {
    if (gameShouldEnd) finishGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameShouldEnd]);

  if (gameShouldEnd) return null;

  return (
    <div className="screen center">
      <div className="panel wide game-panel">
        <button
          type="button"
          className="btn-icon-mute"
          onClick={toggleFeedback}
          aria-label={feedbackOn ? "Вимкнути звук і вібрацію" : "Увімкнути звук і вібрацію"}
          title={feedbackOn ? "Звук і вібрація увімкнені" : "Звук і вібрація вимкнені"}
        >
          {feedbackOn ? "🔊" : "🔇"}
        </button>

        <div className="score-row">
          {game.teams.map((t, i) => (
            <div key={t.name} className={`score-pill ${t.color} ${i === game.turnTeamIdx ? "current" : ""}`}>
              <span>{t.name}</span>
              <strong>{t.score}</strong>
            </div>
          ))}
        </div>

        <p className="round-label">
          Раунд {game.round} з {maxRounds} · пояснює {explainerName} ·{" "}
          {game.mode === "custom" ? "слова від суперника" : GENRES.find((g) => g.id === game.genre)?.label || "Загальні слова"}
          {game.scoring === "hard" ? " · 🔥 на бали (−1 за скіп)" : ""}
        </p>

        <div className="round-progress" aria-hidden="true">
          <div
            className={`round-progress-fill ${game.timeLeft <= 10 && game.running ? "urgent" : ""}`}
            style={{
              width: `${Math.max(0, Math.min(100, (game.timeLeft / game.roundDuration) * 100))}%`,
              background: `var(--${currentTeam.color})`,
            }}
          />
        </div>

        <div className={`timer-ring-wrap ${game.timeLeft <= 10 && game.running ? "urgent" : ""}`}>
          <svg className="timer-ring" viewBox="0 0 120 120">
            <circle className="timer-ring-track" cx="60" cy="60" r={TIMER_RADIUS} />
            <circle
              className="timer-ring-progress"
              cx="60" cy="60" r={TIMER_RADIUS}
              style={{
                stroke: `var(--${currentTeam.color})`,
                strokeDasharray: TIMER_CIRCUMFERENCE,
                strokeDashoffset: TIMER_CIRCUMFERENCE * (1 - game.timeLeft / game.roundDuration),
              }}
            />
          </svg>
          <span className="timer-num">{game.timeLeft}</span>
        </div>

        <div className="word-card big tilt">
          <span className="word-card-label">
            {wordHidden
              ? isGuessingTeammate
                ? `Слухай ${explainerName || "гравця"} і вгадуй`
                : "Слово бачить лише той, хто зараз пояснює"
              : game.running ? "Пояснюй" : timeUp ? "Час вийшов" : "Готові?"}
          </span>
          <span className="word-card-word">
            {wordHidden ? "🙈" : game.running || timeUp ? currentWord : "•••"}
          </span>
        </div>

        {history.length > 0 && (
          <div className="word-history" aria-label="Останні слова цього ходу">
            {history.map((h, i) => (
              <span key={i} className={`word-history-chip ${h.correct ? "correct" : "skipped"}`}>
                {h.correct ? "✅" : "⏭"} {h.word}
              </span>
            ))}
          </div>
        )}

        {locked && (
          <p className="hint">
            Хід команди «{currentTeam.name}» — кнопки активні лише в гравців цієї
            команди, а слово бачить лише той, хто зараз пояснює.
          </p>
        )}

        {!game.running && !timeUp && (
          <button className="btn btn-primary btn-block" onClick={startTimer} disabled={locked}>
            Почати таймер
          </button>
        )}

        {game.running && (
          isGuessingTeammate ? (
            // Кнопками керує лише той, хто пояснює (говорить і бачить
            // слово) — гравець, який слухає й вгадує, кнопок не бачить
            // взагалі, щоб не тиснув їх наздогад, не бачачи слова.
            <p className="hint listening-hint">
              🎧 Кнопки натискає {explainerName || "той, хто пояснює"} — а ти слухай і вгадуй.
            </p>
          ) : (
            <div className="game-actions">
              <button className="btn btn-skip" onClick={() => nextWord(1, false)} disabled={locked}>Скіп</button>
              <button className="btn btn-correct" onClick={() => nextWord(0, true)} disabled={locked}>Вгадав</button>
            </div>
          )
        )}

        {timeUp && (
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              vibrate(VIBRATE_TAP);
              if (!online && game.teams.length === 1) finishGame();
              else endTurn();
            }}
            disabled={locked}
          >
            {game.teams.length > 1 ? "Передати хід" : "Завершити гру"}
          </button>
        )}
      </div>
    </div>
  );
}
