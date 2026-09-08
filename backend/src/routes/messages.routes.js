import { Router } from "express";
import { listThreads, listConversation, sendMessage } from "../controllers/messages.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { sendMessageSchema } from "../validators/messages.validators.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(listThreads));
router.get("/:friendId", requireAuth, asyncHandler(listConversation));
router.post("/:friendId", requireAuth, validate(sendMessageSchema), asyncHandler(sendMessage));

export default router;
