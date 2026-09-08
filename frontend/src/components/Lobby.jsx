import { useState, useEffect } from "react";
import { GENRES, ROUND_DURATIONS, SCORING_MODES } from "../data/wordBanks.js";
import { MAX_TEAM_SIZE, MIN_TEAM_COUNT, MAX_TEAM_COUNT, TEAM_KEYS, teamLobbySize } from "../data/limits.js";
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
// пише СВОЇ слова, які пояснюватиме КОМАНДА-СУПЕРНИК; власний список
// суперника тут навмисне не показуємо. Якщо в команді два гравці, слова
// обох ОБ'ЄДНУЮТЬСЯ в один спільний пул — тому wordsPerTeam це ціль на
// всю команду разом, а не персональна квота (командний прогрес видно
// нижче формою, у підказці "Команда N подала X/Y слів").
function WordsSubmitForm({ myWords, wordsPerTeam, onSubmit, onListDecks, onSaveDeck, onDeleteDeck }) {
  const initialText = myWords.join("\n");
  const [text, setText] = useState(initialText);
  // Текст, що відповідає останньому УСПІШНО збереженому стану — початково
  // це те саме, що прийшло з сервера (lobby.myWords). Поки поточний текст
  // збігається з ним, кнопка не потрібна: показувати "Зберегти слова"
  // одразу після вдалого збереження нема сенсу — нічого нового відправляти.
  // Кнопка з'являється знову лише коли людина справді відредагувала слова.
  const [savedText, setSavedText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const words = text.split(/[\n,]/).map((w) => w.trim()).filter(Boolean);
  const uniqueCount = new Set(words).size;
  const isDirty = text.trim() !== savedText.trim();

  const handleSave = async () => {
    setError("");
    setBusy(true);
    try {
      await onSubmit(words);
      setSavedText(text);
    } catch (err) {
      setError(err.message || "Не вдалося зберегти слова");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-block">
      <span className="settings-label">Твої слова для суперника ({uniqueCount})</span>
      <p className="hint">
        Кожне слово — з нового рядка (або через кому). Це побачить лише твоя
        команда — суперник дізнається слово лише коли настане його хід. Якщо
        вас у команді двоє, слова обох додаються разом до спільної цілі —
        {" "}{wordsPerTeam} слів на команду.
      </p>
      <textarea
        className="words-textarea"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Наприклад:\nПарасолька\nВулик\nТелескоп"}
      />
      {error && <p className="error">{error}</p>}
      {isDirty ? (
        <button className="btn btn-ghost btn-small" type="button" disabled={busy || uniqueCount < 1} onClick={handleSave}>
          {busy ? "Зберігаємо…" : "Зберегти слова"}
        </button>
      ) : (
        uniqueCount > 0 && <p className="hint words-saved-hint">Збережено ✓</p>
      )}

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

  // Скільки команд активно в цьому лобі: "pairs" завжди рівно про дві
  // сторони. "team" дозволяє капітану обрати 2-4 (lobby.teamCount), а
  // "custom" тепер теж бере це з lobby.teamCount — там воно росте само
  // разом із кількістю гравців (бекенд, joinLobby), а не обирається руками.
  const teamCount = mode === "team" || isCustom ? lobby.teamCount || MIN_TEAM_COUNT : 2;
  const activeTeamKeys = TEAM_KEYS.slice(0, teamCount);
  const teamArray = (key) => lobby[`team${key}`] || [];
  const teamOf = (id) => activeTeamKeys.find((key) => teamArray(key).includes(id)) || null;

  // Перейменування команди: доступно будь-кому з ЇЇ учасників (не лише
  // капітану), і лише поки лобі не стартувало — після старту заголовок
  // команди в самій грі (Game.jsx) уже фіксований на весь матч.
  const myTeam = teamOf(user.id);
  const [editingTeam, setEditingTeam] = useState(null); // "A" | "B" | "C" | "D" | null
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
    const displayName = lobby.teamNames?.[team] || defaultLabel;
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

  const wordsReady = !isCustom || activeTeamKeys.every((key) => lobby.wordsStatus?.[key]?.ready);
  const canStart = (mode === "pairs"
    ? lobby.players.length >= 1
    // Кожна активна команда має мати хоча б одного гравця — інакше хід
    // ніколи до неї не дійде.
    : activeTeamKeys.every((key) => teamArray(key).length >= 1)) && wordsReady;

  const genreLabel = GENRES.find((g) => g.id === lobby.genre)?.label || "Загальні слова";
  const roundsLabel = lobby.totalRounds || 3;
  const wordsPerTeamLabel = lobby.wordsPerTeam || 5;
  const scoringLabel = lobby.scoring || "classic";
  const scoringDisplayLabel = SCORING_MODES.find((s) => s.id === scoringLabel)?.label || "Звичайний";

  const TEAM_DEFAULT_LABELS = { A: "Команда 1", B: "Команда 2", C: "Команда 3", D: "Команда 4" };
  const TEAM_CHIP_CLASS = { A: "chip-coral", B: "chip-blue", C: "chip-amber", D: "chip-mint" };

  // Щоб усім (не лише капітану) було зрозуміло, хто з ким і проти кого
  // грає, у командному режимі малюємо гравців групами замість одного
  // суцільного списку — по одній групі на активну команду.
  const teamGroups = activeTeamKeys.map((key) => ({
    key,
    title: TEAM_DEFAULT_LABELS[key],
    chipClass: TEAM_CHIP_CLASS[key],
    players: lobby.players.filter((p) => teamArray(key).includes(p.id)),
  }));
  const unassignedPlayers = lobby.players.filter((p) => !teamOf(p.id));

  // Команда заповнена, якщо в ній уже MAX_TEAM_SIZE гравців — тоді кнопка
  // призначення в неї недоступна для всіх, крім тих, хто вже там.
  const isTeamFull = (key) => teamArray(key).length >= MAX_TEAM_SIZE;
  const teamLabel = (key) => lobby.teamNames?.[key] || TEAM_DEFAULT_LABELS[key];

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
            {mode === "team" && (
              <div className="settings-block">
                <span className="settings-label">Кількість команд</span>
                <div className="chip-row">
                  {Array.from({ length: MAX_TEAM_COUNT - MIN_TEAM_COUNT + 1 }, (_, i) => MIN_TEAM_COUNT + i).map((n) => (
                    <button
                      key={n}
                      className={teamCount === n ? "chip chip-amber active" : "chip chip-amber"}
                      onClick={() => onSettings({ teamCount: n })}
                      type="button"
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="hint">Максимум {teamLobbySize(teamCount)} гравців у лобі при {teamCount} командах по {MAX_TEAM_SIZE}.</p>
              </div>
            )}
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
          {mode === "team" || isCustom
            ? ` Лобі вміщує до ${teamLobbySize(teamCount)} гравців (${lobby.players.length}/${teamLobbySize(teamCount)}) при ${teamCount} ${teamCount === 1 ? "команді" : "командах"}.`
            : ""}
          {isCustom && teamCount < MAX_TEAM_COUNT
            ? ` ${teamCount * MAX_TEAM_SIZE + 1}-й гравець відкриє наступну команду.`
            : ""}
        </p>

        {mode === "team" || isCustom ? (
          // Групуємо за командою, щоб усім (не лише капітану) було видно
          // хто з ким грає в парі й проти кого — раніше це бачив тільки
          // капітан по підсвіченій кнопці біля кожного гравця. Групи
          // динамічні (2-4, за teamGroups вище) в обох режимах — у "team"
          // кількість обирає капітан, у "custom" вона росте сама.
          <div className="team-groups">
            {teamGroups.map((group) => (
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
                          {activeTeamKeys.map((key) => (
                            <button
                              key={key}
                              className={teamOf(p.id) === key ? `chip ${TEAM_CHIP_CLASS[key]} active` : `chip ${TEAM_CHIP_CLASS[key]}`}
                              onClick={() => onAssign(p.id, key)}
                              disabled={teamOf(p.id) !== key && isTeamFull(key)}
                              title={teamOf(p.id) !== key && isTeamFull(key) ? `У команді вже максимум гравців (${MAX_TEAM_SIZE})` : undefined}
                            >
                              {teamLabel(key)}
                            </button>
                          ))}
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
                          {activeTeamKeys.map((key) => (
                            <button
                              key={key}
                              className={`chip ${TEAM_CHIP_CLASS[key]}`}
                              onClick={() => onAssign(p.id, key)}
                              disabled={isTeamFull(key)}
                              title={isTeamFull(key) ? `У команді вже максимум гравців (${MAX_TEAM_SIZE})` : undefined}
                            >
                              {teamLabel(key)}
                            </button>
                          ))}
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
            {activeTeamKeys
              .map((key) => {
                const status = lobby.wordsStatus?.[key];
                return `${teamLabel(key)} подала ${status?.count || 0}/${wordsPerTeamLabel} слів${status?.ready ? " ✅" : ""}`;
              })
              .join(" · ")}
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
