// Тонка обгортка над fetch: базовий URL бекенду, авторизаційний заголовок,
// одна спроба автоматичного refresh при 401 (доступ-токен живе 15 хв).

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const TOKEN_KEY = "elias:accessToken";

// App.jsx підписується сюди один раз при монтуванні (setSessionExpiredHandler
// нижче), щоб показати спливаюче вікно "тебе вибило з акаунту" й повернути
// на landing/auth — незалежно від того, який саме запит/екран це виявив
// (лобі, профіль, дека тощо). Без цього гачка кожен виклик apiRequest мусив
// би сам знати, як почистити глобальний стан сесії — а це вже робота App.jsx.
let onSessionExpired = null;
export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function rawRequest(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    credentials: "include", // потрібно для httpOnly refresh-кукі
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  return { res, data };
}

async function tryRefresh() {
  try {
    const { res, data } = await rawRequest("/api/auth/refresh", { method: "POST", auth: false });
    if (res.ok && data?.accessToken) {
      setAccessToken(data.accessToken);
      return true;
    }
  } catch {
    // мережева помилка чи сервер не піднято — просто не вдалось
  }
  return false;
}

/**
 * Виконує запит до API. Кидає Error з полем `.details` (масив помилок
 * валідації з бекенду, якщо є) при неуспішній відповіді.
 */
export async function apiRequest(path, options = {}) {
  let { res, data } = await rawRequest(path, options);

  if (res.status === 401 && options.auth !== false && getAccessToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      ({ res, data } = await rawRequest(path, options));
    } else {
      onSessionExpired?.();
    }
  }

  if (!res.ok) {
    const message = data?.error || `Помилка запиту (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }

  return data;
}

export const api = {
  register: (name, password) =>
    apiRequest("/api/auth/register", { method: "POST", body: { name, password }, auth: false }),
  login: (name, password) =>
    apiRequest("/api/auth/login", { method: "POST", body: { name, password }, auth: false }),
  me: () => apiRequest("/api/auth/me"),
  logout: () => apiRequest("/api/auth/logout", { method: "POST" }),
  refresh: () => tryRefresh(),

  // Профіль гравця зі статистикою (ігор зіграно / % вгаданих слів).
  getProfile: (publicId) => apiRequest(`/api/users/${publicId}`),
  // Зміна імені акаунту (екран Профіль) — бекенд у відповідь шле і новий
  // accessToken (як при вході), бо старий містить старе ім'я в payload.
  updateProfile: (name) => apiRequest("/api/users/me", { method: "PATCH", body: { name } }),
  // Аватарка — data URI від utils/image.js (вже обрізане й стиснуте до
  // ~200x200 фото). removeAvatar повертає кольоровий кружечок з літерою.
  updateAvatar: (avatar) => apiRequest("/api/users/me/avatar", { method: "PATCH", body: { avatar } }),
  removeAvatar: () => apiRequest("/api/users/me/avatar", { method: "DELETE" }),
  // Одиночна гра рахується повністю на клієнті (без лобі/сокетів) — тож
  // після фінішу шлемо результат сюди, щоб він теж потрапив у статистику.
  recordSoloResult: (guessed, skipped) =>
    apiRequest("/api/users/me/solo-result", { method: "POST", body: { guessed, skipped } }),

  // Улюблені набори слів ("колоди") для гри з друзями (режим "Підставний суддя").
  listDecks: () => apiRequest("/api/decks"),
  createDeck: (name, words) => apiRequest("/api/decks", { method: "POST", body: { name, words } }),
  updateDeck: (id, patch) => apiRequest(`/api/decks/${id}`, { method: "PUT", body: patch }),
  deleteDeck: (id) => apiRequest(`/api/decks/${id}`, { method: "DELETE" }),

  createLobby: (mode, roundDuration, genre, totalRounds, wordsPerTeam) =>
    apiRequest("/api/lobby", { method: "POST", body: { mode, roundDuration, genre, totalRounds, wordsPerTeam } }),
  getLobby: (code) => apiRequest(`/api/lobby/${code}`),
  joinLobby: (code) => apiRequest(`/api/lobby/${code}/join`, { method: "POST" }),
  assignTeam: (code, playerId, team) =>
    apiRequest(`/api/lobby/${code}/team`, { method: "POST", body: { playerId, team } }),
  // Перейменувати свою команду (доступно будь-кому з учасників команди,
  // не лише капітану) — лише поки лобі не стартувало.
  renameTeam: (code, team, name) =>
    apiRequest(`/api/lobby/${code}/team-name`, { method: "PATCH", body: { team, name } }),
  updateLobbySettings: (code, patch) =>
    apiRequest(`/api/lobby/${code}/settings`, { method: "PATCH", body: patch }),
  // Режим "Підставний суддя": подати список слів своєї команди (пояснюватиме їх суперник).
  submitWords: (code, words) =>
    apiRequest(`/api/lobby/${code}/words`, { method: "POST", body: { words } }),
  startLobby: (code) => apiRequest(`/api/lobby/${code}/start`, { method: "POST" }),
  // Рейтинг гравців лобі за накопиченою статистикою акаунтів.
  getLobbyLeaderboard: (code) => apiRequest(`/api/lobby/${code}/leaderboard`),
  // Капітан прибирає гравця з лобі (зайшов помилково або відвалився).
  kickPlayer: (code, playerId) =>
    apiRequest(`/api/lobby/${code}/players/${playerId}`, { method: "DELETE" }),

  // Друзі: список друзів + вхідні заявки (TopBar.jsx/Friends.jsx).
  listFriends: () => apiRequest("/api/friends"),
  sendFriendRequest: (publicId) =>
    apiRequest("/api/friends/requests", { method: "POST", body: { publicId } }),
  // Позначити всі вхідні заявки переглянутими — коли відкривається дзвіночок.
  markFriendRequestsSeen: () => apiRequest("/api/friends/requests/seen", { method: "POST" }),
  acceptFriendRequest: (id) => apiRequest(`/api/friends/requests/${id}/accept`, { method: "POST" }),
  declineFriendRequest: (id) => apiRequest(`/api/friends/requests/${id}`, { method: "DELETE" }),
  removeFriend: (friendshipId) => apiRequest(`/api/friends/${friendshipId}`, { method: "DELETE" }),

  // Особисті повідомлення (чат із друзями — Chat.jsx). listChatMessages
  // заразом позначає вхідні повідомлення цього треда прочитаними на бекенді.
  listChatThreads: () => apiRequest("/api/messages"),
  listChatMessages: (friendId) => apiRequest(`/api/messages/${friendId}`),
  sendChatMessage: (friendId, text) =>
    apiRequest(`/api/messages/${friendId}`, { method: "POST", body: { text } }),
};
