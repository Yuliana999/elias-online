// Спільні ігрові обмеження — узгоджені з backend/src/config/constants.js.
// Тримаємо тут одним місцем, щоб UI (кнопки/лічильники) і бекенд
// (реальна перевірка) показували те саме число.

// Максимум гравців в одній команді.
export const MAX_TEAM_SIZE = 2;

// Максимум гравців у лобі режиму "pairs" (гра рівно 1 на 1).
export const MAX_PAIRS_LOBBY_SIZE = 2;

// Скільки команд можна створити в режимі "team" (капітан обирає в
// налаштуваннях лобі). "custom"/"pairs" завжди рівно про дві сторони.
export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 4;
export const TEAM_KEYS = ["A", "B", "C", "D"];

// Максимум гравців у лобі режиму "custom" РАЗОМ (там завжди 2 команди).
export const MAX_TEAM_LOBBY_SIZE = MAX_TEAM_SIZE * MIN_TEAM_COUNT;

// Максимум гравців у лобі режиму "team" — залежить від lobby.teamCount,
// рахуємо динамічно там, де відомий конкретний лобі (Lobby.jsx).
export function teamLobbySize(teamCount) {
  return MAX_TEAM_SIZE * (teamCount || MIN_TEAM_COUNT);
}
