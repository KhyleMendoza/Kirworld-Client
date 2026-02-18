import { useCallback } from 'react';
import '../styles/DPad.css';

export default function DPad({ onDirection }) {
  const handleTouchStart = useCallback(
    (dx, dy) => () => onDirection(dx, dy),
    [onDirection]
  );
  const handleTouchEnd = useCallback(() => onDirection(0, 0), [onDirection]);

  return (
    <div className="dpad" aria-hidden>
      <div className="dpad-row">
        <button
          type="button"
          className="dpad-btn dpad-up"
          onTouchStart={handleTouchStart(0, -1)}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart(0, -1)}
          onMouseLeave={handleTouchEnd}
          onMouseUp={handleTouchEnd}
        >
          ↑
        </button>
      </div>
      <div className="dpad-row dpad-mid">
        <button
          type="button"
          className="dpad-btn dpad-left"
          onTouchStart={handleTouchStart(-1, 0)}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart(-1, 0)}
          onMouseLeave={handleTouchEnd}
          onMouseUp={handleTouchEnd}
        >
          ←
        </button>
        <span className="dpad-center" />
        <button
          type="button"
          className="dpad-btn dpad-right"
          onTouchStart={handleTouchStart(1, 0)}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart(1, 0)}
          onMouseLeave={handleTouchEnd}
          onMouseUp={handleTouchEnd}
        >
          →
        </button>
      </div>
      <div className="dpad-row">
        <button
          type="button"
          className="dpad-btn dpad-down"
          onTouchStart={handleTouchStart(0, 1)}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart(0, 1)}
          onMouseLeave={handleTouchEnd}
          onMouseUp={handleTouchEnd}
        >
          ↓
        </button>
      </div>
    </div>
  );
}
