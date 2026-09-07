import { useState } from "react";

export default function Auth({ mode, setMode, onAuth, onBack, error, busy }) {
  const [identifier, setIdentifier] = useState(""); // ім'я — і при реєстрації, і при вході
  const [pass, setPass] = useState("");

  const switchMode = (m) => {
    setMode(m);
    setIdentifier("");
    setPass("");
  };

  return (
    <div className="screen center">
      <div className="panel">
        <button className="link-back" onClick={onBack}>← На головну</button>
        <div className="tabs">
          <button className={mode === "register" ? "tab active" : "tab"} onClick={() => switchMode("register")}>
            Реєстрація
          </button>
          <button className={mode === "login" ? "tab active" : "tab"} onClick={() => switchMode("login")}>
            Вхід
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAuth(identifier, pass);
          }}
        >
          <label>
            Ім'я
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Як тебе звати?"
              minLength={2}
              maxLength={40}
              required
            />
          </label>
          <label>
            Пароль
            <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder="••••••••" required minLength={6} />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? "Хвилинку…" : mode === "register" ? "Створити акаунт" : "Увійти"}
          </button>
        </form>

        <p className="hint">
          {mode === "register"
            ? "Ім'я має бути унікальним (без урахування регістру та зайвих пробілів) — лише літери, цифри, пробіл, апостроф і дефіс, 2–40 символів."
            : "Увійди за іменем, яке вказував при реєстрації, та своїм паролем."}
        </p>
      </div>
    </div>
  );
}
