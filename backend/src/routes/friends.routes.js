import { Router } from "express";
import {
  listFriends,
  sendRequest,
  acceptRequest,
  declineRequest,
  removeFriend,
  markRequestsSeen,
} from "../controllers/friends.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { sendFriendRequestSchema } from "../validators/friends.validators.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(listFriends));
router.post("/requests", requireAuth, validate(sendFriendRequestSchema), asyncHandler(sendRequest));
// /requests/seen — до параметричного /requests/:id/accept, інакше "seen"
// довелось би трактувати як id заявки (той самий трюк, що й users.routes.js#/me).
router.post("/requests/seen", requireAuth, asyncHandler(markRequestsSeen));
router.post("/requests/:id/accept", requireAuth, asyncHandler(acceptRequest));
router.delete("/requests/:id", requireAuth, asyncHandler(declineRequest));
router.delete("/:id", requireAuth, asyncHandler(removeFriend));

export default router;
