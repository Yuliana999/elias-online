// Спільні ігрові обмеження, які мають діяти всюди (бекенд + фронтенд
// звіряються з тим самим числом, щоб ліміт не "розʼїжджався" між ними).

// Максимум гравців в одній команді — режими "team" і "custom".
export const MAX_TEAM_SIZE = 2;

// Максимум гравців у лобі режиму "pairs" (гра рівно 1 на 1: капітан + друг).
export const MAX_PAIRS_LOBBY_SIZE = 2;

// Скільки команд можна мати одночасно — у режимі "team" капітан обирає
// це число сам (Lobby.jsx#onSettings({ teamCount })), а в "custom" воно
// росте автоматично разом із кількістю гравців (lobby.controller.js#joinLobby),
// але в обох випадках лишається в межах MIN_TEAM_COUNT..MAX_TEAM_COUNT.
// "pairs" — завжди рівно 1 на 1, teamCount на нього не впливає.
export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 4;
// Ключі команд у порядку створення — teamA..teamD у Lobby.js.
export const TEAM_KEYS = ["A", "B", "C", "D"];

// Максимум гравців у лобі режиму "custom" РАЗОМ — на відміну від "team",
// тут капітан нічого не обирає: нова команда (C, потім D) з'являється
// сама, щойно набирається ще MAX_TEAM_SIZE гравців понад поточну
// кількість команд (див. requiredTeamCount нижче й lobby.controller.js#joinLobby).
// Ця константа — верхня межа на випадок усіх MAX_TEAM_COUNT команд.
export const MAX_TEAM_LOBBY_SIZE = MAX_TEAM_SIZE * MAX_TEAM_COUNT;

// Максимум гравців у лобі режиму "team" РАЗОМ — залежить від того,
// скільки команд обрав капітан (lobby.teamCount), тому це верхня межа
// на випадок MAX_TEAM_COUNT команд. Реальний ліміт для конкретного лобі
// рахується як MAX_TEAM_SIZE * lobby.teamCount (див. lobby.controller.js).
export const MAX_TEAM_MODE_LOBBY_SIZE = MAX_TEAM_SIZE * MAX_TEAM_COUNT;

// Скільки команд потрібно режиму "custom", щоб вмістити playerCount
// гравців по MAX_TEAM_SIZE у кожній — використовується для автоматичного
// зростання лобі (2 команди на 1-4 гравців, 3 — на 5-6, 4 — на 7-8+).
export function requiredTeamCount(playerCount) {
  const needed = Math.ceil((playerCount || 0) / MAX_TEAM_SIZE);
  return Math.min(MAX_TEAM_COUNT, Math.max(MIN_TEAM_COUNT, needed));
}

// Тип рахунку партії — незалежний від mode (pairs/team/custom), тож
// доступний у кожному з них однаково:
//  - "classic": рахунок команди = скільки слів вона вгадала (як і було
//    раніше — скіп рахунку не чіпає).
//  - "hard": за кожне вгадане слово команда отримує бали, а за кожен
//    скіп — втрачає (рахунок може піти в мінус). Значення нижче задають,
//    скільки саме — і бекенд (sockets/index.js), і фронтенд (одиночна
//    гра, яка рахує локально) звіряються з цими самими числами.
export const SCORING_MODES = ["classic", "hard"];
export const HARD_MODE_GUESS_POINTS = 1;
export const HARD_MODE_SKIP_PENALTY = 1;
