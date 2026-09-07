import { Router } from "express";
import { register, login, refresh, logout, me } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { registerSchema, loginSchema } from "../validators/auth.validators.js";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), asyncHandler(register));
router.post("/login", authLimiter, validate(loginSchema), asyncHandler(login));
router.post("/refresh", authLimiter, asyncHandler(refresh));
router.post("/logout", asyncHandler(logout));
router.get("/me", requireAuth, asyncHandler(me));

export default router;
