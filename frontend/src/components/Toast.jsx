import { useEffect } from "react";

// Спливаюче вікно НАГОРІ екрана — для подій рівня акаунту (вийшов з
// акаунту / сесію завершено), а не звичайних локальних помилок форм чи
// лобі. Рендериться в App.jsx поза екранами (screen === ...), тож
// лишається видимим незалежно від того, на якому екрані ми в цей момент.
// Автоматично зникає за DURATION мс, або одразу по кліку на "×".
const DURATION = 5000;

export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(onDismiss, DURATION);
    return () => clearTimeout(id);
    // toast.text у залежностях: новий тост (навіть з тим самим kind)
    // повинен перезапустити таймер, а не доживати старий.
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.kind || "info"}`} role="status">
      <span>{toast.text}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Закрити">
        ×
      </button>
    </div>
  );
}
