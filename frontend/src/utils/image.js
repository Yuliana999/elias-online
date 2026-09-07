// Обробка фото для аватарки прямо на клієнті: обрізаємо по центру до
// квадрата, стискаємо до фіксованого розміру й кодуємо в JPEG data URI —
// щоб на бекенд летів вже маленький рядок, готовий лягти прямо в
// документ юзера в MongoDB (без окремого файлового сховища — див.
// backend/src/models/User.js).

const AVATAR_SIZE = 200; // px, сторона квадрата
const JPEG_QUALITY = 0.82;

// Найбільший файл, який взагалі приймаємо з <input type="file"> — щоб не
// вантажити в пам'ять/канвас щось на кшталт 20-мегапіксельного фото з
// телефону. Сама аватарка після стиснення буде на порядки меншою.
export const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024; // 8 МБ

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не вдалося розпізнати зображення"));
    img.src = src;
  });
}

/**
 * Бере File з <input type="file" accept="image/*">, обрізає по центру до
 * квадрата, зменшує до AVATAR_SIZE×AVATAR_SIZE і повертає JPEG data URI
 * (рядок формату "data:image/jpeg;base64,..."), готовий для
 * api.updateAvatar(). Кидає Error з людяним повідомленням, якщо файл не
 * підходить.
 */
export async function fileToAvatarDataUrl(file) {
  if (!file) throw new Error("Файл не вибрано");
  if (!file.type.startsWith("image/")) {
    throw new Error("Можна завантажити лише зображення");
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error("Файл завеликий (максимум 8 МБ)");
  }

  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  // Обрізаємо по центру до квадрата зі стороною = менша з двох сторін.
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
