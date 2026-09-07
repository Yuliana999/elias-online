import { Router } from "express";
import { listDecks, createDeck, updateDeck, deleteDeck } from "../controllers/decks.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { createDeckSchema, updateDeckSchema } from "../validators/deck.validators.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(listDecks));
router.post("/", requireAuth, validate(createDeckSchema), asyncHandler(createDeck));
router.put("/:id", requireAuth, validate(updateDeckSchema), asyncHandler(updateDeck));
router.delete("/:id", requireAuth, asyncHandler(deleteDeck));

export default router;
