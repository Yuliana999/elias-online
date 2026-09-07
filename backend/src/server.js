import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { connectDB } from "./config/db.js";
import { attachSockets } from "./sockets/index.js";
import { restoreGames } from "./game/store.js";
import authRoutes from "./routes/auth.routes.js";
import lobbyRoutes from "./routes/lobby.routes.js";
import decksRoutes from "./routes/decks.routes.js";
import usersRoutes from "./routes/users.routes.js";

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
// За проксі (Render/Railway тощо) — щоб req.secure й express-rate-limit
// бачили реальний IP/протокол клієнта, а не проксі.
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "10kb" })); // тіла запитів тут маленькі — з запасом
app.use(cookieParser());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/lobby", lobbyRoutes);
app.use("/api/decks", decksRoutes);
app.use("/api/users", usersRoutes);

// Загальний обробник помилок — щоб async-контролери не валили сервер мовчки.
// Ловить у т.ч. помилки з async-хендлерів завдяки asyncHandler у роутах.
app.use((err, req, res, next) => {
  console.error("[error]", err);

  if (err.name === "ValidationError") {
    return res.status(400).json({ error: "Некоректні дані", details: err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: "Такий запис вже існує" });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: "Некоректний ID" });
  }

  res.status(500).json({ error: "Внутрішня помилка сервера" });
});

const httpServer = http.createServer(app);
const io = attachSockets(httpServer, CLIENT_ORIGIN);
// Контролери (напр. lobby.controller.js) шлють події через req.app.get("io")
app.set("io", io);

async function start() {
  const required = ["MONGODB_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`[server] Не задано у .env: ${missing.join(", ")}`);
    process.exit(1);
  }

  await connectDB(process.env.MONGODB_URI);

  // Підхоплюємо назад у пам'ять активні партії, збережені до попереднього
  // рестарту (див. game/store.js) — рахунок і прогрес по словах не
  // губляться, хоча таймер завжди стартує заново.
  const restoredCount = await restoreGames();
  if (restoredCount) {
    console.log(`[server] Відновлено ${restoredCount} активних(-у) партій(-ю) з Mongo після рестарту`);
  }

  httpServer.listen(PORT, () => {
    console.log(`[server] Еліас бекенд запущено на порту ${PORT}`);
  });
}

start();
