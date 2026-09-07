import { useState } from "react";

// Екран, на який людина потрапляє за посиланням з листа
// (?resetToken=...) — див. App.jsx, який дістає токен з URL і передає
// його сюди неявно через onReset (App.jsx уже знає токен, тут його
// вдруге питати не треба).
export default function ResetPassword({ onReset, onBack }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Пароль має містити мінімум 6 символів");
      return;
    }
    if (password !== confirm) {
      setError("Паролі не збігаються");
      return;
    }

    setBusy(true);
    try {
      await onReset(password);
      setDone(true);
    } catch (err) {
      setError(err.message || "Не вдалося оновити пароль. Спробуй запросити нове посилання.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="screen center">
        <div className="panel">
          <h2>Пароль оновлено</h2>
          <p>Тепер можна увійти з новим паролем — на всіх пристроях довелось увійти заново.</p>
          <button className="btn btn-primary btn-block" onClick={onBack}>
            До входу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen center">
      <div className="panel">
        <button className="link-back" onClick={onBack}>
          ← На головну
        </button>
        <h2>Новий пароль</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Посилання діє 1 годину з моменту запиту.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            Новий пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
              autoFocus
            />
          </label>
          <label>
            Повтори пароль
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? "Зберігаємо…" : "Зберегти новий пароль"}
          </button>
        </form>
      </div>
    </div>
  );
}
