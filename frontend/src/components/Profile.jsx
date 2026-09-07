import { useRef, useState } from "react";
import { avatarHue } from "../utils/gameHelpers.js";
import { fileToAvatarDataUrl } from "../utils/image.js";

export default function Profile({ user, onBack, onSave, onSaveAvatar, onRemoveAvatar, onOpenFriends }) {
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Окремий busy/error для фото — щоб зміна аватарки не заважала формі
  // імені (це два незалежні запити на бекенд).
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef(null);

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

  const handlePickPhoto = () => fileInputRef.current?.click();

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // щоб можна було обрати той самий файл повторно
    if (!file) return;
    setPhotoError("");
    setPhotoBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      await onSaveAvatar(dataUrl);
    } catch (err) {
      setPhotoError(err.message || "Не вдалося завантажити фото");
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoError("");
    setPhotoBusy(true);
    try {
      await onRemoveAvatar();
    } catch (err) {
      setPhotoError(err.message || "Не вдалося прибрати фото");
    } finally {
      setPhotoBusy(false);
    }
  };

  const stats = user.stats || { gamesPlayed: 0, wordsGuessed: 0, wordsMissed: 0, accuracy: 0 };
  // Аватарка — фото, якщо завантажене, інакше кольоровий кружечок з
  // першою літерою імені (генерується з ID, тож колір лишається стабільним).
  const previewLetter = (name.trim() || user.name).charAt(0).toUpperCase();

  return (
    <div className="screen center">
      <div className="panel">
        <button className="link-back" onClick={onBack}>← До меню</button>

        <div className="profile-avatar-wrap">
          {user.avatar ? (
            <img className="profile-avatar-big profile-avatar-photo" src={user.avatar} alt="Аватарка" />
          ) : (
            <span className={`profile-avatar-big ${avatarHue(user.id)}`}>{previewLetter}</span>
          )}
          <button
            type="button"
            className="avatar-edit-btn"
            onClick={handlePickPhoto}
            disabled={photoBusy}
            aria-label="Змінити фото"
            title="Змінити фото"
          >
            ✎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handlePhotoChange}
          />
        </div>
        {photoBusy && <p className="hint center-text">Завантажуємо…</p>}
        {photoError && <p className="error center-text">{photoError}</p>}
        {user.avatar && !photoBusy && (
          <button
            type="button"
            className="link-remove-photo"
            onClick={handleRemovePhoto}
          >
            Прибрати фото
          </button>
        )}

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
