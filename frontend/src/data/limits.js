// Спільні ігрові обмеження — узгоджені з backend/src/config/constants.js.
// Тримаємо тут одним місцем, щоб UI (кнопки/лічильники) і бекенд
// (реальна перевірка) показували те саме число.

// Максимум гравців в одній команді.
export const MAX_TEAM_SIZE = 2;

// Максимум гравців у лобі режиму "pairs" (гра рівно 1 на 1).
export const MAX_PAIRS_LOBBY_SIZE = 2;

// Скільки команд може бути активно (2-4). У "team" капітан обирає це в
// налаштуваннях лобі, у "custom" воно росте автоматично разом із
// кількістю гравців. "pairs" завжди рівно про дві сторони.
export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 4;
export const TEAM_KEYS = ["A", "B", "C", "D"];

// Максимум гравців у лобі режиму "custom" РАЗОМ — на відміну від "team",
// тут капітан нічого не обирає: нова команда (C, потім D) з'являється
// сама, щойно набирається ще MAX_TEAM_SIZE гравців понад поточну
// кількість команд (див. requiredTeamCount нижче). Ця константа — верхня
// межа на випадок усіх MAX_TEAM_COUNT команд.
export const MAX_TEAM_LOBBY_SIZE = MAX_TEAM_SIZE * MAX_TEAM_COUNT;

// Максимум гравців у лобі режиму "team"/"custom" — залежить від
// lobby.teamCount, рахуємо динамічно там, де відомий конкретний лобі
// (Lobby.jsx).
export function teamLobbySize(teamCount) {
  return MAX_TEAM_SIZE * (teamCount || MIN_TEAM_COUNT);
}

// Скільки команд потрібно режиму "custom", щоб вмістити playerCount
// гравців по MAX_TEAM_SIZE у кожній — той самий розрахунок, що й на
// бекенді (config/constants.js#requiredTeamCount), потрібен фронтенду,
// щоб підказати "N-й гравець відкриє наступну команду" (Lobby.jsx).
export function requiredTeamCount(playerCount) {
  const needed = Math.ceil((playerCount || 0) / MAX_TEAM_SIZE);
  return Math.min(MAX_TEAM_COUNT, Math.max(MIN_TEAM_COUNT, needed));
}
