import { z } from "zod";
import { MIN_TEAM_COUNT, MAX_TEAM_COUNT } from "../config/constants.js";

// Скільки команд у режимі "team" — 2, 3 або 4 (MIN_TEAM_COUNT..MAX_TEAM_COUNT).
const teamCountSchema = z
  .number({ invalid_type_error: "teamCount має бути числом" })
  .int()
  .min(MIN_TEAM_COUNT, `Мінімум ${MIN_TEAM_COUNT} команди`)
  .max(MAX_TEAM_COUNT, `Максимум ${MAX_TEAM_COUNT} команди`)
  .optional();

export const createLobbySchema = z.object({
  mode: z.enum(["pairs", "team", "custom"], {
    errorMap: () => ({ message: "mode має бути 'pairs', 'team' або 'custom'" }),
  }),
  // Лише для mode === "team": на скільки команд ділити лобі (2-4).
  teamCount: teamCountSchema,
  roundDuration: z.union([
    z.literal(30),
    z.literal(45),
    z.literal(60),
    z.literal(90),
    z.literal(120),
  ]).optional(),
  totalRounds: z.number({ invalid_type_error: "totalRounds має бути числом" })
    .int()
    .min(1, "Мінімум 1 коло")
    .max(10, "Максимум 10 кіл")
    .optional(),
  genre: z.enum(["general", "movies", "anime", "manga", "manhwa", "yaoi", "games", "animals", "food", "sport", "music", "geo", "science"]).optional(),
  // Лише для mode === "custom": скільки слів має подати кожна команда.
  wordsPerTeam: z.number({ invalid_type_error: "wordsPerTeam має бути числом" })
    .int()
    .min(5, "Мінімум 5 слів на команду")
    .max(40, "Максимум 40 слів на команду")
    .optional(),
  // Тип рахунку — доступний однаково в pairs/team/custom (config/constants.js#SCORING_MODES).
  scoring: z.enum(["classic", "hard"], {
    errorMap: () => ({ message: "scoring має бути 'classic' або 'hard'" }),
  }).optional(),
});

export const assignTeamSchema = z.object({
  playerId: z.string({ required_error: "Потрібен playerId" }).trim().min(1, "Потрібен playerId"),
  // Реально дозволені літери залежать від режиму й lobby.teamCount —
  // це контролер (lobby.controller.js#activeTeamKeys) перевіряє додатково.
  team: z.enum(["A", "B", "C", "D"], {
    errorMap: () => ({ message: "team має бути 'A', 'B', 'C' або 'D'" }),
  }),
});

export const settingsSchema = z.object({
  roundDuration: z.union([
    z.literal(30),
    z.literal(45),
    z.literal(60),
    z.literal(90),
    z.literal(120),
  ]).optional(),
  totalRounds: z.number({ invalid_type_error: "totalRounds має бути числом" })
    .int()
    .min(1, "Мінімум 1 коло")
    .max(10, "Максимум 10 кіл")
    .optional(),
  genre: z.enum(["general", "movies", "anime", "manga", "manhwa", "yaoi", "games", "animals", "food", "sport", "music", "geo", "science"]).optional(),
  wordsPerTeam: z.number({ invalid_type_error: "wordsPerTeam має бути числом" })
    .int()
    .min(5, "Мінімум 5 слів на команду")
    .max(40, "Максимум 40 слів на команду")
    .optional(),
  scoring: z.enum(["classic", "hard"], {
    errorMap: () => ({ message: "scoring має бути 'classic' або 'hard'" }),
  }).optional(),
  // Лише для mode === "team": на скільки команд ділити лобі (2-4).
  teamCount: teamCountSchema,
});

// Перейменування своєї команди учасником (не лише капітаном) до старту
// гри. Порожній рядок після trim = "скинути на дефолтну назву".
export const renameTeamSchema = z.object({
  team: z.enum(["A", "B", "C", "D"], {
    errorMap: () => ({ message: "team має бути 'A', 'B', 'C' або 'D'" }),
  }),
  name: z.string().trim().max(24, "Максимум 24 символи").default(""),
});

// Слова, які команда придумала для суперника. Нормалізуємо (обрізаємо
// пробіли, прибираємо порожні й дублікати), щоб контролер уже отримував
// чистий список і просто звіряв його довжину з wordsPerTeam.
export const submitWordsSchema = z.object({
  words: z
    .array(z.string().trim().min(1).max(40))
    .min(1, "Додай хоча б одне слово")
    .transform((arr) => [...new Set(arr)]),
});
