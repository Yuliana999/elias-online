import { useEffect, useRef, useState } from "react";
import { api } from "../api/http.js";
import { getSocket } from "../api/socket.js";
import { avatarHue } from "../utils/gameHelpers.js";

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function PeerAvatar({ peer }) {
  return peer.avatar ? (
    <img className="player-avatar player-avatar-photo" src={peer.avatar} alt="" />
  ) : (
    <span className={`player-avatar ${avatarHue(peer.id)}`}>{peer.name.charAt(0).toUpperCase()}</span>
  );
}

// Чат-віджет із друзями: кнопка в нижньому правому куті (той самий розмір
// і стиль, що й дзвіночок/аватарка нагорі — top-bar-icon-btn з app.css),
// а над нею розкривається панель зі списком розмов і самим листуванням.
// Показується лише на екрані меню (App.jsx рендерить <Chat /> всередині
// Menu.jsx, поруч із TopBar).
//
// На відміну від друзів/заявок (стан яких тримає App.jsx, бо він потрібен
// і TopBar, і окремому екрану "friends"), треди й повідомлення чату більше
// нікому, крім цього віджета, не потрібні — тож тримаємо їх тут локально,
// а не роздуваємо App.jsx ще одним шаром стану.
export default function Chat({ user, friends }) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null); // publicId друга чи null (список тредів)
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const wrapRef = useRef(null);
  const bottomRef = useRef(null);

  const totalUnread = threads.reduce((sum, t) => sum + (t.unread || 0), 0);

  // Треди підвантажуємо одразу при монтуванні (а не лише при відкритті
  // панелі) — щоб бейдж з непрочитаним на кнопці був видимий одразу, так
  // само як бейдж дзвіночка в TopBar.
  useEffect(() => {
    api
      .listChatThreads()
      .then(({ threads: ts }) => setThreads(ts))
      .catch(() => {});
  }, []);

  // Реалтайм: нове повідомлення від будь-кого з друзів. Якщо саме ця
  // розмова зараз відкрита — одразу дописуємо бульбашку; інакше лише
  // піднімаємо тред нагору списку й збільшуємо лічильник непрочитаного.
  useEffect(() => {
    const socket = getSocket();
    const onMessage = ({ message }) => {
      const otherId = message.fromId === user.id ? message.toId : message.fromId;
      const isOpenHere = open && activeFriend === otherId;

      setThreads((ts) => {
        const prev = ts.find((t) => t.friendId === otherId);
        const rest = ts.filter((t) => t.friendId !== otherId);
        const incoming = message.fromId !== user.id;
        return [
          {
            friendId: otherId,
            lastMessage: message.text,
            lastAt: message.createdAt,
            unread: isOpenHere ? 0 : (prev?.unread || 0) + (incoming ? 1 : 0),
          },
          ...rest,
        ];
      });

      if (isOpenHere) setMessages((ms) => [...ms, message]);
    };
    socket.on("chat:message", onMessage);
    return () => socket.off("chat:message", onMessage);
  }, [open, activeFriend, user.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const openThread = async (friendId) => {
    setActiveFriend(friendId);
    setMessages([]);
    setLoading(true);
    try {
      const { messages: ms } = await api.listChatMessages(friendId);
      setMessages(ms);
      // GET уже позначив вхідні повідомлення прочитаними на бекенді —
      // локально одразу обнуляємо бейдж цього треда, не чекаючи наступного
      // listChatThreads.
      setThreads((ts) => ts.map((t) => (t.friendId === friendId ? { ...t, unread: 0 } : t)));
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || !activeFriend || sending) return;
    setSending(true);
    setText("");
    try {
      const { message } = await api.sendChatMessage(activeFriend, value);
      setMessages((ms) => [...ms, message]);
      setThreads((ts) => {
        const rest = ts.filter((t) => t.friendId !== activeFriend);
        return [{ friendId: activeFriend, lastMessage: message.text, lastAt: message.createdAt, unread: 0 }, ...rest];
      });
    } catch {
      setText(value); // не надіслалось — повертаємо текст у поле, щоб не загубити
    } finally {
      setSending(false);
    }
  };

  const friendById = (id) => friends.find((f) => f.id === id);
  const activeFriendInfo = activeFriend ? friendById(activeFriend) : null;
  const threadIds = new Set(threads.map((t) => t.friendId));
  // Друзі, з якими розмови ще немає — щоб можна було написати першим,
  // а не лише відповідати на вхідні повідомлення.
  const friendsWithoutThread = friends.filter((f) => !threadIds.has(f.id));

  return (
    <div className="chat-widget-wrap" ref={wrapRef}>
      {open && (
        <div className="chat-panel">
          {!activeFriend ? (
            <>
              <div className="chat-panel-title">Повідомлення</div>
              <div className="chat-thread-list">
                {threads.length === 0 && friendsWithoutThread.length === 0 && (
                  <p className="bell-empty">Ще немає друзів, з ким переписатись.</p>
                )}
                {threads.map((t) => {
                  const f = friendById(t.friendId);
                  if (!f) return null;
                  return (
                    <button type="button" className="chat-thread-row" key={t.friendId} onClick={() => openThread(t.friendId)}>
                      <PeerAvatar peer={f} />
                      <span className="chat-thread-info">
                        <span className="chat-thread-name">{f.name}</span>
                        <span className="chat-thread-preview">{t.lastMessage}</span>
                      </span>
                      {t.unread > 0 && <span className="top-bar-badge chat-thread-badge">{t.unread > 9 ? "9+" : t.unread}</span>}
                    </button>
                  );
                })}
                {friendsWithoutThread.map((f) => (
                  <button type="button" className="chat-thread-row" key={f.id} onClick={() => openThread(f.id)}>
                    <PeerAvatar peer={f} />
                    <span className="chat-thread-info">
                      <span className="chat-thread-name">{f.name}</span>
                      <span className="chat-thread-preview chat-thread-preview-muted">Написати перше повідомлення</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="chat-panel-title chat-panel-title-conv">
                <button type="button" className="chat-back-btn" onClick={() => setActiveFriend(null)} aria-label="Назад до списку">
                  ←
                </button>
                {activeFriendInfo && <PeerAvatar peer={activeFriendInfo} />}
                <span>{activeFriendInfo?.name || "Друг"}</span>
              </div>
              <div className="chat-messages">
                {loading && <p className="bell-empty">Завантаження…</p>}
                {!loading && messages.length === 0 && <p className="bell-empty">Напиши перше повідомлення.</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`chat-bubble ${m.fromId === user.id ? "chat-bubble-mine" : "chat-bubble-theirs"}`}>
                    {m.text}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <form className="chat-input-row" onSubmit={handleSend}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Повідомлення…"
                  maxLength={2000}
                  autoFocus
                />
                <button className="btn btn-primary btn-small" type="submit" disabled={sending || !text.trim()}>
                  Надіслати
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <div className="chat-toggle-wrap">
        <button
          type="button"
          className="top-bar-icon-btn chat-toggle-btn"
          onClick={() => setOpen((v) => !v)}
          aria-label="Повідомлення"
        >
          <ChatIcon />
          {totalUnread > 0 && <span className="top-bar-badge">{totalUnread > 9 ? "9+" : totalUnread}</span>}
        </button>
      </div>
    </div>
  );
}
