import GameState from "../models/GameState.js";

// Стан живих партій лежить у пам'яті процесу — гра синхронно читається й
// пишеться десятки разів на секунду (кожен тік таймера), і ганяти це
// через Mongo на кожен виклик було б і повільно, і зайве. Партій
// одночасно мало і живуть вони недовго, тож сама мапа лишається основним
// "джерелом правди" під час роботи процесу.
//
// Але тепер кожна суттєва зміна (старт партії, вгадане/скіпнуте слово,
// кінець ходу — див. виклики persistGame у sockets/index.js) додатково
// асинхронно зберігається як "знімок" у колекції GameState:
// fire-and-forget, не блокує сокет-подію, помилка запису лише
// логується. Якщо процес впаде посеред гри, restoreGames() при
// наступному старті підхопить ці знімки назад у games — рахунок і
// прогрес по словах не губляться. Таймер (running/interval) свідомо не
// відновлюється: setInterval не серіалізується, тож після рестарту
// гравцям доведеться самим натиснути "старт" ще раз.
const games = new Map();

export function setGame(code, game) {
  games.set(code, game);
  persistGame(game);
}

export function getGame(code) {
  return games.get(code);
}

export function deleteGame(code) {
  const game = games.get(code);
  if (game?.interval) clearInterval(game.interval);
  games.delete(code);
  GameState.deleteOne({ code }).catch((err) =>
    console.error(`[game/store] не вдалось прибрати знімок ${code}:`, err.message)
  );
}

// interval — живий об'єкт таймера Node.js, не серіалізується й у Mongo
// не потрібен (після рестарту він однаково втрачений).
function toSnapshot(game) {
  const { interval, ...snapshot } = game;
  return snapshot;
}

// Не блокує виклика: помилка запису лише логується, партія в пам'яті
// процесу продовжує жити своїм життям незалежно від того, чи вдався
// цей конкретний запис у Mongo.
export function persistGame(game) {
  const snapshot = toSnapshot(game);
  GameState.updateOne({ code: game.code }, { $set: snapshot }, { upsert: true }).catch((err) =>
    console.error(`[game/store] не вдалось зберегти знімок ${game.code}:`, err.message)
  );
}

// Викликається один раз при старті сервера (server.js), одразу після
// підключення до Mongo: підхоплює всі збережені незавершені знімки назад
// у пам'ять, щоб активні партії пережили рестарт процесу. Повертає
// кількість відновлених партій (для логу).
export async function restoreGames() {
  const docs = await GameState.find({ finished: false }).lean();
  for (const doc of docs) {
    const { _id, __v, createdAt, updatedAt, ...game } = doc;
    game.running = false;
    game.interval = null;
    games.set(game.code, game);
  }
  return docs.length;
}
