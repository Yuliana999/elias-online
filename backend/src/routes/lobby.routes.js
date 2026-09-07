import { Router } from "express";
import {
  createLobby,
  getLobby,
  joinLobby,
  assignTeam,
  updateSettings,
  renameTeam,
  submitWords,
  startLobby,
  kickPlayer,
  getLeaderboard,
} from "../controllers/lobby.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import {
  createLobbySchema,
  assignTeamSchema,
  settingsSchema,
  renameTeamSchema,
  submitWordsSchema,
} from "../validators/lobby.validators.js";

const router = Router();

router.post("/", requireAuth, validate(createLobbySchema), asyncHandler(createLobby));
router.get("/:code", requireAuth, asyncHandler(getLobby));
router.post("/:code/join", requireAuth, asyncHandler(joinLobby));
router.post("/:code/team", requireAuth, validate(assignTeamSchema), asyncHandler(assignTeam));
router.patch("/:code/settings", requireAuth, validate(settingsSchema), asyncHandler(updateSettings));
// Будь-хто з учасників команди (не лише капітан) може перейменувати
// СВОЮ команду, поки лобі не стартувало (перевірка — в контролері).
router.patch("/:code/team-name", requireAuth, validate(renameTeamSchema), asyncHandler(renameTeam));
router.post("/:code/words", requireAuth, validate(submitWordsSchema), asyncHandler(submitWords));
router.post("/:code/start", requireAuth, asyncHandler(startLobby));
router.get("/:code/leaderboard", requireAuth, asyncHandler(getLeaderboard));
router.delete("/:code/players/:playerId", requireAuth, asyncHandler(kickPlayer));

export default router;
