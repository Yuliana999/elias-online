import { useRef, useState } from "react";
import { GENRES, ROUND_DURATIONS, SCORING_MODES } from "../data/wordBanks.js";
import { MAX_TEAM_SIZE } from "../data/limits.js";

const ROUNDS_OPTIONS = [1, 2, 3, 4, 5, 6];
const MIN_PLAYERS = 1;
const MAX_PLAYERS = 12;
const TEAM_CHIP_CLASSES = ["chip-amber", "chip-coral", "chip-blue"];

export default function SoloSetup({ user, onStart, onBack }) {
  const nextId = useRef(2);
  const [players, setPlayers] = useState([
    { id: 0, name: user?.name || "Гравець 1", team: 1 },
    { id: 1, name: "", team: 2 },
  ]);
  const [roundDuration, setRoundDuration] = useState(60);
  const [rounds, setRounds] = useState(3);
  const [genre, setGenre] = useState("general");
  const [scoring, setScoring] = useState("classic");
  const [error, setError] = useState("");

  const updateName = (id, value) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name: value } : p)));
  };

  const updateTeam = (id, team) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, team } : p)));
  };

  const addPlayer = () => {
    if (players.length >= MAX_PLAYERS) return;
    const id = nextId.current++;
    setPlayers((prev) => [...prev, { id, name: "", team: prev.length + 1 }]);
  };

  const removePlayer = (id) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  // Максимальний номер команди, який має сенс пропонувати — не більше,
  // ніж гравців у списку (кожен сам за себе — це вже стеля).
  const maxTeamNumber = Math.max(players.length, 1);
  const teamOptions = Array.from({ length: maxTeamNumber }, (_, i) => i + 1);

  // Скільки гравців вже сидить у кожній команді — щоб не дати зібрати
  // команду більше MAX_TEAM_SIZE людей (те саме обмеження, що й в
  // онлайн-лобі).
  const teamCounts = players.reduce((acc, p) => {
    acc[p.team] = (acc[p.team] || 0) + 1;
    return acc;
  }, {});
  const isTeamFull = (teamNumber, forPlayerId) =>
    (teamCounts[teamNumber] || 0) >= MAX_TEAM_SIZE &&
    !players.some((p) => p.id === forPlayerId && p.team === teamNumber);

  const cleanPlayers = players
    .map((p) => ({ ...p, name: p.name.trim() }))
    .filter((p) => p.name);
  const canStart = cleanPlayers.length >= MIN_PLAYERS;

  // Групуємо гравців за номером команди, який вони обрали (1, 2, 3…),
  // і нумеруємо самі команди по порядку зростання цього номера.
  const buildTeams = () => {
    const byTeam = new Map();
    cleanPlayers.forEach((p) => {
      if (!byTeam.has(p.team)) byTeam.set(p.team, []);
      byTeam.get(p.team).push(p.name);
    });
    const sortedKeys = [...byTeam.keys()].sort((a, b) => a - b);
    return sortedKeys.map((key) => byTeam.get(key));
  };

  const handleStart = () => {
    if (!canStart) {
      setError("Впиши хоча б одне ім'я гравця");
      return;
    }
    onStart({
      teams: buildTeams(),
      roundDuration,
      rounds,
      genre,
      scoring,
    });
  };

  return (
    <div className="screen center">
      <div className="panel wide">
        <button className="link-back" onClick={onBack}>← До меню</button>
        <h2>Одиночна гра</h2>
        <p className="hint">
          Для тих, хто вже поруч у реалі: по черзі передавайте один пристрій —
          акаунт та інтернет-лобі не потрібні. Гравцям з однаковим номером
          команди рахуються спільні очки (максимум {MAX_TEAM_SIZE} гравці в одній команді).
        </p>

        <div className="settings-section">
          <div className="settings-block">
            <span className="settings-label">Гравці ({cleanPlayers.length || 0})</span>
            <div className="players-list">
              {players.map((p, idx) => (
                <div className="player-row" key={p.id}>
                  <input
                    value={p.name}
                    onChange={(e) => updateName(p.id, e.target.value)}
                    placeholder={`Ім'я гравця ${idx + 1}`}
                  />
                  {players.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => removePlayer(p.id)}
                    >
                      Прибрати
                    </button>
                  )}
                  <div className="team-btns">
                    <span className="settings-label" style={{ alignSelf: "center" }}>Команда:</span>
                    {teamOptions.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={
                          p.team === n
                            ? `chip ${TEAM_CHIP_CLASSES[(n - 1) % TEAM_CHIP_CLASSES.length]} active`
                            : `chip ${TEAM_CHIP_CLASSES[(n - 1) % TEAM_CHIP_CLASSES.length]}`
                        }
                        onClick={() => updateTeam(p.id, n)}
                        disabled={isTeamFull(n, p.id)}
                        title={isTeamFull(n, p.id) ? `У команді вже максимум гравців (${MAX_TEAM_SIZE})` : undefined}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={addPlayer}
              disabled={players.length >= MAX_PLAYERS}
            >
              + Додати гравця
            </button>
          </div>

          <div className="settings-block">
            <span className="settings-label">Тривалість раунду</span>
            <div className="chip-row">
              {ROUND_DURATIONS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={roundDuration === sec ? "chip chip-amber active" : "chip chip-amber"}
                  onClick={() => setRoundDuration(sec)}
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
                  type="button"
                  className={rounds === n ? "chip chip-amber active" : "chip chip-amber"}
                  onClick={() => setRounds(n)}
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
                  type="button"
                  className={scoring === s.id ? "chip chip-amber active" : "chip chip-amber"}
                  onClick={() => setScoring(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="hint">{SCORING_MODES.find((s) => s.id === scoring)?.hint}</p>
          </div>

          <div className="settings-block">
            <span className="settings-label">Жанр слів</span>
            <div className="chip-row">
              {GENRES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={genre === g.id ? "chip chip-amber active" : "chip chip-amber"}
                  onClick={() => setGenre(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <button className="btn btn-primary btn-block" disabled={!canStart} onClick={handleStart}>
          Почати гру
        </button>
      </div>
    </div>
  );
}
