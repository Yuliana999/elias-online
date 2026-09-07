import { io } from "socket.io-client";
import { API_URL, getAccessToken } from "./http.js";

let socket = null;

// Один спільний сокет на сесію: створюємо лінькво (при першому потрібному
// моменті — вхід у лобі), перевикористовуємо між екранами лобі/гри.
export function getSocket() {
  if (socket) return socket;

  socket = io(API_URL, {
    autoConnect: false,
    withCredentials: true,
    auth: (cb) => cb({ token: getAccessToken() }),
  });

  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
