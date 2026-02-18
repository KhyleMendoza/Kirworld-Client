import '../styles/ZoomControls.css';

export default function ZoomControls({ onZoomIn, onZoomOut }) {
  return (
    <div className="zoom-controls" aria-label="Zoom">
      <button type="button" className="zoom-btn zoom-in" onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
      <button type="button" className="zoom-btn zoom-out" onClick={onZoomOut} aria-label="Zoom out">
        −
      </button>
    </div>
  );
}
