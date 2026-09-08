import { useState } from "react";
import TopBar from "./TopBar.jsx";
import Chat from "./Chat.jsx";

function ModeCard({ title, desc, onClick }) {
  return (
    <button className="mode-card" onClick={onClick}>
      <span className="mode-card-title">{title}</span>
      <span className="mode-card-desc">{desc}</span>
    </button>
  );
}

export default function Menu({
  user,
  onChoose,
  onJoin,
  onLogout,
  notice,
  onDismissNotice,
  friends,
  friendRequests,
  onOpenProfile,
  onOpenFriends,
  onOpenBell,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
}) {
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinError("");
    setJoinBusy(true);
    try {
      await onJoin(joinCode);
    } catch (err) {
      setJoinError(err.message || "Не вдалося приєднатись");
    } finally {
      setJoinBusy(false);
    }
  };

  return (
    <>
      <TopBar
        user={user}
        requests={friendRequests}
        onOpenProfile={onOpenProfile}
        onOpenFriends={onOpenFriends}
        onOpenBell={onOpenBell}
        onAccept={onAcceptFriendRequest}
        onDecline={onDeclineFriendRequest}
      />
      <Chat user={user} friends={friends} />
      <div className="screen center">
      <div className="panel wide">
        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button className="notice-close" onClick={onDismissNotice} aria-label="Закрити">×</button>
          </div>
        )}
        <div className="id-card">
          <div>
            <span className="id-label">Твій ID</span>
            <span className="id-value">{user.id}</span>
          </div>
          <button
            className="btn btn-ghost btn-small"
            onClick={() => {
              navigator.clipboard?.writeText(user.id);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? "Скопійовано" : "Копіювати"}
          </button>
        </div>

        {user.stats && (
          <div className="stats-row">
            <div className="stats-cell">
              <strong>{user.stats.gamesPlayed}</strong>
              <span>{user.stats.gamesPlayed === 1 ? "гра зіграна" : "ігор зіграно"}</span>
            </div>
            <div className="stats-cell">
              <strong>{user.stats.accuracy}%</strong>
              <span>вгаданих слів</span>
            </div>
          </div>
        )}

        <h2>Привіт, {user.name}. Що граємо?</h2>

        <div className="mode-grid">
          <ModeCard
            title="Одиночна гра"
            desc="Для тих, хто вже поруч: передавайте пристрій по черзі. Самі обираєте час раунду і кількість гравців."
            onClick={() => onChoose("solo")}
          />
          <ModeCard
            title="Гра в парах"
            desc="Стань капітаном і створи лобі 1 на 1 — код покажеш другу."
            onClick={() => onChoose("pairs")}
          />
          <ModeCard
            title="Командна гра"
            desc="Стань капітаном, створи лобі, розподіли гравців по командах."
            onClick={() => onChoose("team")}
          />
          <ModeCard
            title="Підставний суддя"
            desc="Команди самі придумують слова одна одній: свої слова пояснює суперник, а не жанрова колода."
            onClick={() => onChoose("custom")}
          />
        </div>

        <form className="add-player-row" onSubmit={handleJoin}>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Є код лобі від капітана? Введи тут"
          />
          <button className="btn btn-primary btn-small" type="submit" disabled={joinBusy}>
            {joinBusy ? "…" : "Приєднатись"}
          </button>
        </form>
        {joinError && <p className="error">{joinError}</p>}

        <button className="link-back" onClick={onLogout}>Вийти з акаунту</button>
      </div>
      </div>
    </>
  );
}
