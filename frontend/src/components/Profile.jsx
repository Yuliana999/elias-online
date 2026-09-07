import { useState } from "react";
import { avatarHue } from "../utils/gameHelpers.js";

export default function Profile({ user, onBack, onSave, onOpenFriends }) {
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await onSave(trimmed);
      setSuccess("Ім'я оновлено.");
    } catch (err) {
      setError(err.message || "Не вдалося зберегти");
    } finally {
      setBusy(false);
    }
  };

  const stats = user.stats || { gamesPlayed: 0, wordsGuessed: 0, wordsMissed: 0, accuracy: 0 };
  // Аватарка — кольоровий кружечок з першою літерою імені (генерується
  // з ID, тож колір лишається стабільним, поки редагуєш поле нижче).
  const previewLetter = (name.trim() || user.name).charAt(0).toUpperCase();

  return (
    <div className="screen center">
      <div className="panel">
        <button className="link-back" onClick={onBack}>← До меню</button>

        <span className={`profile-avatar-big ${avatarHue(user.id)}`}>{previewLetter}</span>

        <div className="id-card">
          <div>
            <span className="id-label">Твій ID</span>
            <span className="id-value">{user.id}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label>
            Ім'я
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={40}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          {success && <p className="hint">{success}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Зберігаємо…" : "Зберегти"}
          </button>
        </form>

        <p className="section-title">Статистика</p>
        <div className="stats-grid">
          <div className="stats-cell">
            <strong>{stats.gamesPlayed}</strong>
            <span>{stats.gamesPlayed === 1 ? "гра зіграна" : "ігор зіграно"}</span>
          </div>
          <div className="stats-cell">
            <strong>{stats.accuracy}%</strong>
            <span>вгаданих слів</span>
          </div>
          <div className="stats-cell">
            <strong>{stats.wordsGuessed}</strong>
            <span>слів вгадано</span>
          </div>
          <div className="stats-cell">
            <strong>{stats.wordsMissed}</strong>
            <span>слів пропущено</span>
          </div>
        </div>

        <button className="btn btn-ghost btn-block" onClick={onOpenFriends}>Мої друзі</button>
      </div>
    </div>
  );
}
