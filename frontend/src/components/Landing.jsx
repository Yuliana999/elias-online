export default function Landing({ onStart, onGuestPlay }) {
  // onStart приймає режим форми ("register" | "login"), щоб кожна кнопка
  // одразу відкривала потрібну вкладку, а не завжди останню обрану.
  return (
    <div className="screen landing">
      <div className="hero">
        <div className="card-fan">
          <div className="word-card fan-left">
            <span className="word-card-label">Слово 12</span>
            <span className="word-card-word">Скрипка</span>
          </div>
          <div className="word-card fan-center">
            <span className="word-card-label">Твоя гра</span>
            <span className="word-card-word">Еліас</span>
          </div>
          <div className="word-card fan-right">
            <span className="word-card-label">Слово 13</span>
            <span className="word-card-word">Кульбаба</span>
          </div>
        </div>
        <h1>Пояснюй. Вгадуй. Перемагай командою.</h1>
        <p className="lede">
          Еліас — гра, де одне слово можна пояснити тисячею способів, а часу
          завжди бракує. Збери команду, роздай ID друзям і починайте раунд.
        </p>
        <div className="cta-row">
          <button className="btn btn-primary" onClick={() => onStart("register")}>Зареєструватися</button>
          <button className="btn btn-ghost" onClick={() => onStart("login")}>Увійти</button>
        </div>
        <button className="link-back guest-cta" onClick={onGuestPlay}>
          Уже разом і просто хочете зіграти? Почати без реєстрації →
        </button>
      </div>

      <div className="rules">
        <div className="rule">
          <span className="rule-num">Поясни</span>
          <p>Один гравець пояснює слово словами, без однокореневих та жестів на камеру.</p>
        </div>
        <div className="rule">
          <span className="rule-num">Вгадай</span>
          <p>Команда називає слово — угадали, картка ваша, час не зупиняється.</p>
        </div>
        <div className="rule">
          <span className="rule-num">Рахуй</span>
          <p>Не знаєте слово — скіп. У кінці раунду рахуємо очки і міняємось.</p>
        </div>
      </div>
    </div>
  );
}
