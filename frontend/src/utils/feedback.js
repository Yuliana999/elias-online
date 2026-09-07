// Звук і вібрація для гри — обидва вмикаються/вимикаються однією
// кнопкою (значок 🔊/🔇 у грі), бо для гравця це одне й те саме поняття
// "фідбек на дії". Звук генерується Web Audio API "на льоту" (кілька
// коротких тонів) — жодних mp3/wav у бандлі не треба, і працює офлайн.

const STORAGE_KEY = "elias:feedbackEnabled";

export function isFeedbackEnabled() {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "1";
}

export function setFeedbackEnabled(enabled) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

/* ------------------------------------------------------------------ */
/* Звук                                                                 */
/* ------------------------------------------------------------------ */

let audioCtx = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null; // старі/нетипові браузери — просто без звуку
  if (!audioCtx) audioCtx = new Ctx();
  // Браузери "присипляють" AudioContext, поки не було жесту користувача.
  // На момент першого натискання кнопки в грі жест уже стався, тож
  // resume() тут майже завжди одразу спрацьовує.
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(freq, duration, { type = "sine", delay = 0, gain = 0.16 } = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const start = ctx.currentTime + delay;
  // Швидкий attack + експоненційний спад — без цього кожен тон клацає
  // на початку/кінці (різкий перепад гучності від нуля).
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playCorrect() {
  if (!isFeedbackEnabled()) return;
  // Короткий висхідний "дзинь" — приємний, не різкий.
  tone(880, 0.11, { type: "sine", gain: 0.14 });
  tone(1318, 0.16, { type: "sine", gain: 0.14, delay: 0.08 });
}

export function playSkip() {
  if (!isFeedbackEnabled()) return;
  // Нижчий і коротший "тук" — нейтральний, не карає гравця звуком.
  tone(220, 0.14, { type: "triangle", gain: 0.12 });
}

export function playTimeUp() {
  if (!isFeedbackEnabled()) return;
  // Три коротких сигнали на спадному тоні — впізнавано як "стоп".
  tone(520, 0.14, { type: "square", gain: 0.1 });
  tone(520, 0.14, { type: "square", gain: 0.1, delay: 0.18 });
  tone(260, 0.32, { type: "square", gain: 0.12, delay: 0.36 });
}

/* ------------------------------------------------------------------ */
/* Вібрація                                                             */
/* ------------------------------------------------------------------ */

// Vibration API підтримується не всюди (зокрема, немає в Safari/iOS) —
// перевірка наявності робить виклик безпечним будь-де.
export function vibrate(pattern) {
  if (!isFeedbackEnabled()) return;
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

export const VIBRATE_CORRECT = 15;
export const VIBRATE_SKIP = 10;
export const VIBRATE_TIME_UP = [70, 60, 70];
export const VIBRATE_TAP = 8; // легкий тактильний відгук на звичайні кнопки
