import mongoose from "mongoose";

export async function connectDB(uri) {
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri);
    console.log("[db] MongoDB підключено");
  } catch (err) {
    console.error("[db] Помилка підключення до MongoDB:", err.message);
    process.exit(1);
  }

  mongoose.connection.on("disconnected", () => {
    console.warn("[db] З'єднання з MongoDB втрачено");
  });
}
