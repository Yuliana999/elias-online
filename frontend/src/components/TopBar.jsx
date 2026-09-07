import { useEffect, useRef, useState } from "react";
import { avatarHue } from "../utils/gameHelpers.js";

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// Дзвіночок сповіщень про заявки в друзі + аватарка-кнопка профілю,
// фіксовані у верхньому правому куті. Показується лише на екрані меню
// (App.jsx рендерить <TopBar /> всередині Menu.jsx).
export default function TopBar({ user, requests, onOpenProfile, onOpenFriends, onOpenBell, onAccept, onDecline }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const unseenCount = requests.filter((r) => !r.seen).length;

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const toggleBell = () => {
    const next = !open;
    setOpen(next);
    if (next) onOpenBell();
  };

  return (
    <div className="top-bar">
      <div className="top-bar-bell-wrap" ref={wrapRef}>
        <button
          type="button"
          className="top-bar-icon-btn"
          onClick={toggleBell}
          aria-label="Сповіщення про друзів"
        >
          <BellIcon />
          {unseenCount > 0 && <span className="top-bar-badge">{unseenCount > 9 ? "9+" : unseenCount}</span>}
        </button>

        {open && (
          <div className="bell-dropdown">
            <div className="bell-dropdown-title">Заявки в друзі</div>
            {requests.length === 0 && <p className="bell-empty">Поки що тихо.</p>}
            {requests.map((r) => (
              <div className="bell-request-row" key={r.id}>
                <span className={`player-avatar ${avatarHue(r.from.id)}`}>
                  {r.from.name.charAt(0).toUpperCase()}
                </span>
                <span className="bell-request-name">{r.from.name}</span>
                <button className="btn btn-primary btn-tiny" onClick={() => onAccept(r.id)}>
                  Прийняти
                </button>
                <button
                  className="btn btn-ghost btn-tiny"
                  onClick={() => onDecline(r.id)}
                  aria-label="Відхилити"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="bell-dropdown-link"
              onClick={() => {
                setOpen(false);
                onOpenFriends();
              }}
            >
              Усі друзі →
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`top-bar-avatar ${avatarHue(user.id)}`}
        onClick={onOpenProfile}
        aria-label="Профіль"
      >
        {user.name.charAt(0).toUpperCase()}
      </button>
    </div>
  );
}
