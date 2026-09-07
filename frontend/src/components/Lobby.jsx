import { useState, useEffect } from "react";
import { GENRES, ROUND_DURATIONS, SCORING_MODES } from "../data/wordBanks.js";
import { MAX_TEAM_SIZE, MAX_TEAM_LOBBY_SIZE } from "../data/limits.js";
import { avatarHue } from "../utils/gameHelpers.js";

const ROUNDS_OPTIONS = [1, 2, 3, 4, 5, 6];
const WORDS_PER_TEAM_OPTIONS = [5, 8, 10, 15, 20];

// Рейтинг гравців лобі за накопиченою статистикою акаунтів (не за
// рахунком поточної партії — для того є Results). Тягнемо один раз при
// вході в лобі й повторно щоразу, як міняється склад гравців, щоб той,
// хто щойно приєднався, теж з'явився у списку.
function Leaderboard({ lobby, onLoadLeaderboard }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const playerIdsKey = lobby.players.map((p) => p.id).join(",");

  useEffect(() => {
    let cancelled = false;
    if (!onLoadLeaderboard) return;
    setError("");
    onLoadLeaderboard()
      .then(({ leaderboard }) => {
        if (!cancelled) setRows(leaderboard);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Не вдалося завантажити рейтинг");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerIdsKey]);

  if (error) return null; // рейтинг — не критична частина екрана, тихо ховаємо при помилці
  if (!rows || rows.length === 0) return null;

  return (
    <div className="settings-block">
      <span className="settings-label">Рейтинг лобі (за % вгаданих слів)</span>
      <div className="leaderboard">
        {rows.map((r, i) => (
          <div className={`leaderboard-row ${i === 0 ? "top" : ""}`} key={r.id}>
            <span className="leaderboard-rank">{i + 1}</span>
            <span className={`player-avatar ${avatarHue(r.id)}`}>{r.name.charAt(0).toUpperCase()}</span>
            <span className="leaderboard-name">{r.name}</span>
            <span className="leaderboard-stat">
              <strong>{r.accuracy}%</strong> · {r.gamesPlayed} {r.gamesPlayed === 1 ? "гра" : "ігор"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Улюблені колоди слів гравця — дозволяють не передруковувати ті самі
// слова щоразу для гри з друзями (режим "custom"): підвантажити готовий
// набір у форму подачі слів або зберегти щойно написане на майбутнє.
function DeckManager({ words, onListDecks, onSaveDeck, onDeleteDeck, onLoad }) {
  const [decks, setDecks] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const loadDecks = () => {
    if (!onListDecks) return;
    onListDecks()
      .then(({ decks: list }) => setDecks(list))
      .catch((err) => setError(err.message || "Не вдалося завантажити колоди"));
  };

  useEffect(loadDecks, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveAsDeck = async () => {
    if (words.length < 1) return;
    const name = window.prompt("Назва колоди (напр. «Мультики»):", "");
    if (!name || !name.trim()) return;
    setError("");
    try {
      await onSaveDeck(name.trim(), words);
      loadDecks();
    } catch (err) {
      setError(err.message || "Не вдалося зберегти колоду");
    }
  };

  const handleDelete = async (id) => {
    setError("");
    setBusyId(id);
    try {
      await onDeleteDeck(id);
      loadDecks();
    } catch (err) {
      setError(err.message || "Не вдалося видалити колоду");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="settings-block">
      <span className="settings-label">Улюблені колоди</span>
      {error && <p className="error">{error}</p>}
      {decks && decks.length > 0 && (
        <div className="deck-list">
          {decks.map((d) => (
            <div className="deck-row" key={d.id}>
              <span className="deck-row-name">{d.name}</span>
              <span className="deck-row-count">{d.wordsCount} слів</span>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => onLoad(d.words)}>
                Завантажити
              </button>
              <button
                type="button"
                className="btn-icon-kick"
                title="Видалити колоду"
                aria-label={`Видалити колоду ${d.name}`}
                disabled={busyId === d.id}
                onClick={() => handleDelete(d.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {decks && decks.length === 0 && (
        <p className="hint">Колод ще немає — напиши слова нижче і збережи як колоду для наступних ігор.</p>
      )}
      <div className="deck-actions">
        <button className="btn btn-ghost btn-small" type="button" disabled={words.length < 1} onClick={handleSaveAsDeck}>
          Зберегти поточні слова як колоду
        </button>
      </div>
    </div>
  );
}

// Форма подачі слів для режиму "custom" ("Підставний суддя"): гравець
// пише слова, які пояснюватиме КОМАНДА-СУПЕРНИК, тому власний список
// суперника тут навмисне не показуємо — лише те, що подала моя команда.
function WordsSubmitForm({ myWords, wordsPerTeam, onSubmit, onListDecks, onSaveDeck, onDeleteDeck }) {
  const [text, setText] = useState(myWords.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const words = text.split(/[\n,]/).map((w) => w.trim()).filter(Boolean);
  const uniqueCount = new Set(words).size;

  const handleSave = async () => {
    setError("");
    setBusy(true);
    try {
      await onSubmit(words);
    } catch (err) {
      setError(err.message || "Не вдалося зберегти слова");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-block">
      <span className="settings-label">
        Твої слова для суперника ({uniqueCount}/{wordsPerTeam})
      </span>
      <p className="hint">
        Кожне слово — з нового рядка (або через кому). Це побачить лише твоя
        команда — суперник дізнається слово лише коли настане його хід.
      </p>
      <textarea
        className="words-textarea"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Наприклад:\nПарасолька\nВулик\nТелескоп"}
      />
      {error && <p className="error">{error}</p>}
      <button className="btn btn-ghost btn-small" type="button" disabled={busy || uniqueCount < 1} onClick={handleSave}>
        {busy ? "Зберігаємо…" : "Зберегти слова"}
      </button>

      {(onListDecks || onSaveDeck) && (
        <DeckManager
          words={words}
          onListDecks={onListDecks}
          onSaveDeck={onSaveDeck}
          onDeleteDeck={onDeleteDeck}
          onLoad={(deckWords) => setText(deckWords.join("\n"))}
        />
      )}
    </div>
  );
}

export default function Lobby({
  mode,
  user,
  lobby,
  onAssign,
  onSettings,
  onRenameTeam,
  onSubmitWords,
  onStart,
  onBack,
  onKick,
  onLoadLeaderboard,
  onListDecks,
  onSaveDeck,
  onDeleteDeck,
}) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [copied, setCopied] = useState(false);
  const [kickingId, setKickingId] = useState(null);
  const [kickError, setKickError] = useState("");
  const isCaptain = lobby.captainId === user.id;
  const isCustom = mode === "custom";

  const handleKick = async (playerId, name) => {
    if (!window.confirm(`Прибрати ${name} з лобі?`)) return;
    setKickError("");
    setKickingId(playerId);
    try {
      await onKick(playerId);
    } catch (err) {
      setKickError(err.message || "Не вдалося прибрати гравця");
    } finally {
      setKickingId(null);
    }
  };

  // Капітан бачить "✕" біля кожного гравця, крім себе — щоб прибрати
  // того, хто зайшов помилково або відвалився. Недоступно поки триває
  // сам кик-запит до сервера (kickingId).
  function KickButton({ player }) {
    if (!isCaptain || player.id === user.id) return null;
    return (
      <button
        type="button"
        className="btn-icon-kick"
        onClick={() => handleKick(player.id, player.name)}
        disabled={kickingId === player.id}
        title="Прибрати з лобі"
        aria-label={`Прибрати ${player.name} з лобі`}
      >
        ✕
      </button>
    );
  }

  const teamOf = (id) => (lobby.teamA.includes(id) ? "A" : lobby.teamB.includes(id) ? "B" : null);

  // Перейменування команди: доступно будь-кому з ЇЇ учасників (не лише
  // капітану), і лише поки лобі не стартувало — після старту заголовок
  // команди в самій грі (Game.jsx) уже фіксований на весь матч.
  const myTeam = teamOf(user.id);
  const [editingTeam, setEditingTeam] = useState(null); // "A" | "B" | null
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [renamingBusy, setRenamingBusy] = useState(false);

  const startEditingTeamName = (team, currentName) => {
    setEditingTeam(team);
    setTeamNameDraft(currentName);
  };

  const saveTeamName = async (team) => {
    const name = teamNameDraft.trim();
    setRenamingBusy(true);
    try {
      await onRenameTeam(team, name);
      setEditingTeam(null);
    } catch (err) {
      window.alert(err.message || "Не вдалося перейменувати команду");
    } finally {
      setRenamingBusy(false);
    }
  };

  // Заголовок групи команди в списку гравців: звичайний текст, а для
  // учасника саме цієї команди — ще й клікабельний олівець поруч, що
  // відкриває поле для перейменування.
  function TeamTitle({ team, defaultLabel }) {
    const displayName = (team === "A" ? lobby.teamNames?.A : lobby.teamNames?.B) || defaultLabel;
    const canRename = myTeam === team && lobby.status === "waiting";

    if (editingTeam === team) {
      return (
        <span className="team-title-name">
          <input
            autoFocus
            className="team-name-input"
            value={teamNameDraft}
            maxLength={24}
            onChange={(e) => setTeamNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTeamName(team);
              if (e.key === "Escape") setEditingTeam(null);
            }}
            placeholder={defaultLabel}
            disabled={renamingBusy}
          />
          <button type="button" className="btn-icon-edit" disabled={renamingBusy} title="Зберегти" onClick={() => saveTeamName(team)}>
            ✓
          </button>
          <button type="button" className="btn-icon-edit" disabled={renamingBusy} title="Скасувати" onClick={() => setEditingTeam(null)}>
            ✕
          </button>
        </span>
      );
    }

    return (
      <span className="team-title-name">
        {displayName}
        {canRename && (
          <button
            type="button"
            className="btn-icon-edit"
            title="Перейменувати свою команду"
            aria-label="Перейменувати свою команду"
            onClick={() => startEditingTeamName(team, displayName === defaultLabel ? "" : displayName)}
          >
            ✎
          </button>
        )}
      </span>
    );
  }

  const wordsReady = !isCustom || (lobby.wordsStatus?.A?.ready && lobby.wordsStatus?.B?.ready);
  const canStart = (mode === "pairs"
    ? lobby.players.length >= 1
    : lobby.teamA.length >= 1 && lobby.teamB.length >= 1) && wordsReady;

  const genreLabel = GENRES.find((g) => g.id === lobby.genre)?.label || "Загальні слова";
  const roundsLabel = lobby.totalRounds || 3;
  const wordsPerTeamLabel = lobby.wordsPerTeam || 5;
  const scoringLabel = lobby.scoring || "classic";
  const scoringDisplayLabel = SCORING_MODES.find((s) => s.id === scoringLabel)?.label || "Звичайний";

  // Щоб усім (не лише капітану) було зрозуміло, хто з ким і проти кого
  // грає, у командному режимі малюємо гравців трьома групами замість
  // одного суцільного списку.
  const teamAPlayers = lobby.players.filter((p) => lobby.teamA.includes(p.id));
  const teamBPlayers = lobby.players.filter((p) => lobby.teamB.includes(p.id));
  const unassignedPlayers = lobby.players.filter((p) => !teamOf(p.id));

  // Команда заповнена, якщо в ній уже MAX_TEAM_SIZE гравців — тоді кнопка
  // призначення в неї недоступна для всіх, крім тих, хто вже там.
  const teamAFull = teamAPlayers.length >= MAX_TEAM_SIZE;
  const teamBFull = teamBPlayers.length >= MAX_TEAM_SIZE;
  // Для кнопок призначення гравця в команду (нижче) — щоб капітан теж
  // бачив актуальні назви, а не завжди дефолтні "Команда 1"/"Команда 2".
  const teamALabel = lobby.teamNames?.A || "Команда 1";
  const teamBLabel = lobby.teamNames?.B || "Команда 2";

  const handleStart = async () => {
    setStartError("");
    setStarting(true);
    try {
      await onStart();
      // сам перехід на екран гри станеться, коли прилетить подія lobby:started
    } catch (err) {
      setStartError(err.message || "Не вдалося почати гру");
      setStarting(false);
    }
  };

  return (
    <div className="screen center">
      <div className="panel wide">
        <button className="link-back" onClick={onBack}>← До меню</button>
        <h2>
          Лобі {isCustom ? "«Підставний суддя»" : mode === "team" ? "командної гри" : "гри в парах"}
        </h2>
        <div className="lobby-code">
          <span>Код лобі — скажи його друзям</span>
          <strong>{lobby.code}</strong>
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(lobby.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? "Скопійовано" : "Копіювати"}
          </button>
        </div>

        {isCaptain ? (
          <div className="settings-section">
            <div className="settings-block">
              <span className="settings-label">Тривалість раунду</span>
              <div className="chip-row">
                {ROUND_DURATIONS.map((sec) => (
                  <button
                    key={sec}
                    className={lobby.roundDuration === sec ? "chip chip-amber active" : "chip chip-amber"}
                    onClick={() => onSettings({ roundDuration: sec })}
                    type="button"
                  >
                    {sec} с
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-block">
              <span className="settings-label">Кількість кіл</span>
              <div className="chip-row">
                {ROUNDS_OPTIONS.map((n) => (
                  <button
                    key={n}
                    className={roundsLabel === n ? "chip chip-amber active" : "chip chip-amber"}
                    onClick={() => onSettings({ totalRounds: n })}
                    type="button"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-block">
              <span className="settings-label">Тип гри</span>
              <div className="chip-row">
                {SCORING_MODES.map((s) => (
                  <button
                    key={s.id}
                    className={scoringLabel === s.id ? "chip chip-amber active" : "chip chip-amber"}
                    onClick={() => onSettings({ scoring: s.id })}
                    type="button"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="hint">{SCORING_MODES.find((s) => s.id === scoringLabel)?.hint}</p>
            </div>
            {isCustom ? (
              <div className="settings-block">
                <span className="settings-label">Слів на команду</span>
                <div className="chip-row">
                  {WORDS_PER_TEAM_OPTIONS.map((n) => (
                    <button
                      key={n}
                      className={wordsPerTeamLabel === n ? "chip chip-amber active" : "chip chip-amber"}
                      onClick={() => onSettings({ wordsPerTeam: n })}
                      type="button"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="settings-block">
                <span className="settings-label">Жанр слів</span>
                <div className="chip-row">
                  {GENRES.map((g) => (
                    <button
                      key={g.id}
                      className={lobby.genre === g.id ? "chip chip-amber active" : "chip chip-amber"}
                      onClick={() => onSettings({ genre: g.id })}
                      type="button"
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="hint">
            Капітан обрав: раунд {lobby.roundDuration} с · {roundsLabel} {roundsLabel === 1 ? "коло" : "кіл"}
            {isCustom ? ` · ${wordsPerTeamLabel} слів на команду` : ` · жанр «${genreLabel}»`}
            {` · тип гри «${scoringDisplayLabel}»`}
          </p>
        )}

        <p className="hint">
          Друзі приєднуються самі: заходять у свій акаунт і вводять код лобі в меню.
          {mode === "team" || isCustom ? ` Лобі вміщує до ${MAX_TEAM_LOBBY_SIZE} гравців (${lobby.players.length}/${MAX_TEAM_LOBBY_SIZE}).` : ""}
        </p>

        {mode === "team" || isCustom ? (
          // Групуємо за командою, щоб усім (не лише капітану) було видно
          // хто з ким грає в парі й проти кого — раніше це бачив тільки
          // капітан по підсвіченій кнопці біля кожного гравця.
          <div className="team-groups">
            {[
              { key: "A", title: "Команда 1", chipClass: "chip-coral", players: teamAPlayers },
              { key: "B", title: "Команда 2", chipClass: "chip-blue", players: teamBPlayers },
            ].map((group) => (
              <div className="team-group" key={group.key}>
                <span className={`settings-label team-group-title ${group.chipClass}`}>
                  <TeamTitle team={group.key} defaultLabel={group.title} />
                  <span className="team-group-count">({group.players.length}/{MAX_TEAM_SIZE})</span>
                </span>
                <div className="players-list">
                  {group.players.length === 0 && <p className="hint team-group-empty">Ще нікого немає</p>}
                  {group.players.map((p) => (
                    <div className="player-row" key={p.id}>
                      <span className={`player-avatar ${avatarHue(p.id)}`}>{p.name.charAt(0).toUpperCase()}</span>
                      <span className="player-name">{p.name}</span>
                      <KickButton player={p} />
                      {isCaptain && (
                        <div className="team-btns">
                          <button
                            className={teamOf(p.id) === "A" ? "chip chip-coral active" : "chip chip-coral"}
                            onClick={() => onAssign(p.id, "A")}
                            disabled={teamOf(p.id) !== "A" && teamAFull}
                            title={teamOf(p.id) !== "A" && teamAFull ? `У команді вже максимум гравців (${MAX_TEAM_SIZE})` : undefined}
                          >
                            {teamALabel}
                          </button>
                          <button
                            className={teamOf(p.id) === "B" ? "chip chip-blue active" : "chip chip-blue"}
                            onClick={() => onAssign(p.id, "B")}
                            disabled={teamOf(p.id) !== "B" && teamBFull}
                            title={teamOf(p.id) !== "B" && teamBFull ? `У команді вже максимум гравців (${MAX_TEAM_SIZE})` : undefined}
                          >
                            {teamBLabel}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {unassignedPlayers.length > 0 && (
              <div className="team-group">
                <span className="settings-label team-group-title">
                  Без команди ({unassignedPlayers.length})
                </span>
                <div className="players-list">
                  {unassignedPlayers.map((p) => (
                    <div className="player-row" key={p.id}>
                      <span className={`player-avatar ${avatarHue(p.id)}`}>{p.name.charAt(0).toUpperCase()}</span>
                      <span className="player-name">{p.name}</span>
                      <KickButton player={p} />
                      {isCaptain ? (
                        <div className="team-btns">
                          <button
                            className="chip chip-coral"
                            onClick={() => onAssign(p.id, "A")}
                            disabled={teamAFull}
                            title={teamAFull ? `У команді вже максимум гравців (${MAX_TEAM_SIZE})` : undefined}
                          >
                            {teamALabel}
                          </button>
                          <button
                            className="chip chip-blue"
                            onClick={() => onAssign(p.id, "B")}
                            disabled={teamBFull}
                            title={teamBFull ? `У команді вже максимум гравців (${MAX_TEAM_SIZE})` : undefined}
                          >
                            {teamBLabel}
                          </button>
                        </div>
                      ) : (
                        <span className="hint">Чекає розподілу</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="players-list">
            {lobby.players.map((p) => (
              <div className="player-row" key={p.id}>
                <span className={`player-avatar ${avatarHue(p.id)}`}>{p.name.charAt(0).toUpperCase()}</span>
                <span className="player-name">{p.name}</span>
                <span className="player-id">{p.id}</span>
                <KickButton player={p} />
              </div>
            ))}
          </div>
        )}

        {kickError && <p className="error">{kickError}</p>}

        {onLoadLeaderboard && <Leaderboard lobby={lobby} onLoadLeaderboard={onLoadLeaderboard} />}

        {isCustom && teamOf(user.id) && (
          <WordsSubmitForm
            myWords={lobby.myWords || []}
            wordsPerTeam={wordsPerTeamLabel}
            onSubmit={onSubmitWords}
            onListDecks={onListDecks}
            onSaveDeck={onSaveDeck}
            onDeleteDeck={onDeleteDeck}
          />
        )}
        {isCustom && (
          <p className="hint">
            Команда 1 подала {lobby.wordsStatus?.A?.count || 0}/{wordsPerTeamLabel} слів
            {lobby.wordsStatus?.A?.ready ? " ✅" : ""} · Команда 2 подала{" "}
            {lobby.wordsStatus?.B?.count || 0}/{wordsPerTeamLabel} слів
            {lobby.wordsStatus?.B?.ready ? " ✅" : ""}
          </p>
        )}

        {startError && <p className="error">{startError}</p>}

        {isCaptain ? (
          <button className="btn btn-primary btn-block" disabled={!canStart || starting} onClick={handleStart}>
            {starting ? "Запускаємо…" : "Почати гру"}
          </button>
        ) : (
          <p className="hint">Очікуємо, поки капітан запустить гру…</p>
        )}
      </div>
    </div>
  );
}
