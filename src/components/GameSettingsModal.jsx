import { useEffect } from 'react';
import '../styles/GameSettingsModal.css';

export function SettingsGearIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"
      />
    </svg>
  );
}

export default function GameSettingsModal({ open, onClose, performanceMode, onPerformanceModeChange }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="game-settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-settings-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="game-settings-modal">
        <h2 id="game-settings-title" className="game-settings-title">
          Settings
        </h2>

        <div className="game-settings-row">
          <button
            type="button"
            className="game-settings-row-hit"
            onClick={() => onPerformanceModeChange?.(!performanceMode)}
          >
            <span className="game-settings-label">Performance mode</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={performanceMode}
            aria-label={performanceMode ? 'Performance mode on' : 'Performance mode off'}
            className={`game-settings-toggle ${performanceMode ? 'is-on' : ''}`}
            onClick={() => onPerformanceModeChange?.(!performanceMode)}
          >
            <span className="game-settings-toggle-knob" />
          </button>
        </div>

        <button type="button" className="game-settings-close" onClick={() => onClose?.()}>
          Close
        </button>
      </div>
    </div>
  );
}
