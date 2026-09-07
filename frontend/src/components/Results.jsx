export default function Results({ result, onRestart, onPlayAgain, restartLabel = "До меню" }) {
  const sorted = [...result.teams].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  return (
    <div className="screen center">
      <div className="panel">
        <h2>Гру завершено</h2>
        {result.teams.length > 1 ? (
          <p className="lede">Перемагає {winner.name} з рахунком {winner.score}.</p>
        ) : (
          <p className="lede">Ти вгадав {winner.score} слів. Непогана розминка.</p>
        )}
        <div className="results-list">
          {sorted.map((t, i) => (
            <div className={`result-row ${i === 0 && sorted.length > 1 ? "winner" : ""}`} key={t.name}>
              <span className="result-name">
                {i === 0 && sorted.length > 1 && <span className="winner-mark">Переможець</span>}
                {t.name}
              </span>
              <strong>{t.score}</strong>
            </div>
          ))}
        </div>
        {onPlayAgain && (
          <button className="btn btn-primary btn-block" onClick={onPlayAgain}>Зіграти ще раз</button>
        )}
        <button className={onPlayAgain ? "btn btn-ghost btn-block" : "btn btn-primary btn-block"} onClick={onRestart}>
          {restartLabel}
        </button>
      </div>
    </div>
  );
}
