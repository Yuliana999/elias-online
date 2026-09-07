import { useState } from "react";
import { avatarHue } from "../utils/gameHelpers.js";

export default function Friends({ friends, requests, onBack, onAdd, onAccept, onDecline, onRemove }) {
  const [addId, setAddId] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addId.trim()) return;
    setAddError("");
    setAddSuccess("");
    setAddBusy(true);
    try {
      await onAdd(addId.trim().toUpperCase());
      setAddSuccess("Заявку надіслано.");
      setAddId("");
    } catch (err) {
      setAddError(err.message || "Не вдалося надіслати заявку");
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <div className="screen center">
      <div className="panel wide">
        <button className="link-back" onClick={onBack}>← До меню</button>
        <h2>Друзі</h2>

        <form className="add-player-row" onSubmit={handleAdd}>
          <input
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
            placeholder="ID гравця (напр. F7K2QW)"
            maxLength={6}
          />
          <button className="btn btn-primary btn-small" type="submit" disabled={addBusy}>
            {addBusy ? "…" : "Додати"}
          </button>
        </form>
        {addError && <p className="error">{addError}</p>}
        {addSuccess && <p className="hint">{addSuccess}</p>}

        {requests.length > 0 && (
          <>
            <p className="section-title">Заявки в друзі</p>
            <div className="friends-list">
              {requests.map((r) => (
                <div className="friend-row" key={r.id}>
                  <span className={`player-avatar ${avatarHue(r.from.id)}`}>
                    {r.from.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="friend-name">{r.from.name}</span>
                  <button className="btn btn-primary btn-tiny" onClick={() => onAccept(r.id)}>
                    Прийняти
                  </button>
                  <button className="btn btn-ghost btn-tiny" onClick={() => onDecline(r.id)}>
                    Відхилити
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="section-title">Твої друзі</p>
        {friends.length === 0 ? (
          <p className="hint">Поки що нікого немає — додай друга по ID вище.</p>
        ) : (
          <div className="friends-list">
            {friends.map((f) => (
              <div className="friend-row" key={f.friendshipId}>
                <span className={`player-avatar ${avatarHue(f.id)}`}>{f.name.charAt(0).toUpperCase()}</span>
                <span className="friend-name">{f.name}</span>
                <span className="friend-meta">
                  {f.stats?.gamesPlayed ?? 0} ігор · {f.stats?.accuracy ?? 0}%
                </span>
                <button
                  className="btn-icon-kick"
                  onClick={() => onRemove(f.friendshipId)}
                  aria-label="Прибрати з друзів"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
