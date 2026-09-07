// Спільні ігрові обмеження, які мають діяти всюди (бекенд + фронтенд
// звіряються з тим самим числом, щоб ліміт не "розʼїжджався" між ними).

// Максимум гравців в одній команді — режими "team" і "custom".
export const MAX_TEAM_SIZE = 2;

// Максимум гравців у лобі режиму "pairs" (гра рівно 1 на 1: капітан + друг).
export const MAX_PAIRS_LOBBY_SIZE = 2;

// Скільки команд можна створити в режимі "team" (капітан обирає в
// налаштуваннях лобі — Lobby.jsx#onSettings({ teamCount })). "custom"
// і "pairs" завжди рівно про дві сторони, тому teamCount на них не
// впливає — там завжди A/B.
export const MIN_TEAM_COUNT = 2;
export const MAX_TEAM_COUNT = 4;
// Ключі команд у порядку створення — teamA..teamD у Lobby.js.
export const TEAM_KEYS = ["A", "B", "C", "D"];

// Максимум гравців у лобі режиму "custom" РАЗОМ (там завжди рівно 2
// команди, незалежно від того, розподілені вони чи ще "без команди").
export const MAX_TEAM_LOBBY_SIZE = MAX_TEAM_SIZE * MIN_TEAM_COUNT;

// Максимум гравців у лобі режиму "team" РАЗОМ — залежить від того,
// скільки команд обрав капітан (lobby.teamCount), тому це верхня межа
// на випадок MAX_TEAM_COUNT команд. Реальний ліміт для конкретного лобі
// рахується як MAX_TEAM_SIZE * lobby.teamCount (див. lobby.controller.js).
export const MAX_TEAM_MODE_LOBBY_SIZE = MAX_TEAM_SIZE * MAX_TEAM_COUNT;

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
