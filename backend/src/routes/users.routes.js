import { Router } from "express";
import { getProfile, recordSoloResult, updateProfile } from "../controllers/users.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { recordSoloResultSchema, updateProfileSchema } from "../validators/users.validators.js";

const router = Router();

// /me/... — до параметричного /:publicId, інакше express сприйняв би
// "me" за publicId і перехопив цей роут.
router.post(
  "/me/solo-result",
  requireAuth,
  validate(recordSoloResultSchema),
  asyncHandler(recordSoloResult)
);
router.patch("/me", requireAuth, validate(updateProfileSchema), asyncHandler(updateProfile));
router.get("/:publicId", requireAuth, asyncHandler(getProfile));

export default router;
