import { useEffect, useMemo, useRef, useState } from 'react';
import { encodePixelsToBase64, decodePixelsFromBase64 } from '../utils/pixelCodec';
import '../styles/FindBlocksModal.css';
const BASE_COLORS = [
  '#000000',
  '#ffffff',
  '#94a3b8',
  '#475569',
  '#0f172a',
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#ef4444',
  '#a855f7',
  '#14b8a6',
  '#f97316',
  '#e5e7eb',
  '#d1d5db',
  '#fef3c7',
  '#fee2e2',
  '#e0f2fe',
  '#dcfce7',
  '#1d4ed8',
  '#15803d',
  '#b45309',
  '#b91c1c',
  '#7e22ce',
  '#0f766e',
  '#c2410c',
  '#111827',
  '#020617',
  '#1e293b',
  '#4b5563',
];

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function makeEmpty(size) {
  return new Uint8Array(size * size);
}

export default function FindBlocksModal({
  open,
  blocks,
  onClose,
  onCreateBlock,
  onAddToInventory,
  snapSize,
  onChangeSnapSize,
}) {
  const [query, setQuery] = useState('');
  const [size] = useState(32);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('block');
  const [selectedColor, setSelectedColor] = useState(5);
  const [tool, setTool] = useState('paint');
  const [pixels, setPixels] = useState(() => makeEmpty(32));
  const [shapePreview, setShapePreview] = useState(null);
  const [extraColors, setExtraColors] = useState([]);
  const [customColor, setCustomColor] = useState('#ffffff');
  const canvasRef = useRef(null);
  const dragRef = useRef({ down: false, startX: 0, startY: 0 });
  const previewCacheRef = useRef(new Map());

  const palette = useMemo(
    () => [...BASE_COLORS, ...extraColors],
    [extraColors],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    setPixels(makeEmpty(size));
  }, [size]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return blocks || [];
    return (blocks || []).filter((b) => String(b.name || '').toLowerCase().includes(q));
  }, [blocks, query]);

  const cell = size === 64 ? 8 : 10;
  const canvasW = size * cell;
  const canvasH = size * cell;

  function getPreview(block) {
    if (!block?.id || !block?.pixels) return null;
    const key = `${block.id}:${block.size}:${block.pixels.length}`;
    const cached = previewCacheRef.current.get(key);
    if (cached) return cached;
    const blockSize = block.size === 64 ? 64 : 32;
    const paletteForBlock = Array.isArray(block.palette)
      ? [...BASE_COLORS, ...block.palette]
      : BASE_COLORS;
    let decoded;
    try {
      decoded = decodePixelsFromBase64(block.pixels);
    } catch {
      return null;
    }
    if (decoded.length < blockSize * blockSize) return null;
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = blockSize;
    srcCanvas.height = blockSize;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) return null;
    const img = srcCtx.createImageData(blockSize, blockSize);
    for (let i = 0; i < blockSize * blockSize; i++) {
      const idx = decoded[i] | 0;
      if (idx === 0) {
        // transparent
        img.data[i * 4 + 3] = 0;
        continue;
      }
      const c = paletteForBlock[idx - 1] || '#000000';
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      img.data[i * 4 + 0] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    srcCtx.putImageData(img, 0, 0);
    const target = 40;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = target;
    outCanvas.height = target;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return null;
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(srcCanvas, 0, 0, blockSize, blockSize, 0, 0, target, target);
    const url = outCanvas.toDataURL();
    previewCacheRef.current.set(key, url);
    return url;
  }

  function getCellFromEvent(e) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
    if (clientX == null || clientY == null) return null;
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const x = clamp(Math.floor(localX / cell), 0, size - 1);
    const y = clamp(Math.floor(localY / cell), 0, size - 1);
    return { x, y };
  }

  function drawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const colorIndex = pixels[idx] | 0;
        if (colorIndex === 0) continue; // transparent / empty
        const c = palette[colorIndex - 1] || '#000000';
        ctx.fillStyle = c;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= size; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cell + 0.5, 0);
      ctx.lineTo(x * cell + 0.5, canvasH);
      ctx.stroke();
    }
    for (let y = 0; y <= size; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell + 0.5);
      ctx.lineTo(canvasW, y * cell + 0.5);
      ctx.stroke();
    }

    if (shapePreview) {
      const x1 = Math.min(shapePreview.x1, shapePreview.x2);
      const y1 = Math.min(shapePreview.y1, shapePreview.y2);
      const x2 = Math.max(shapePreview.x1, shapePreview.x2);
      const y2 = Math.max(shapePreview.y1, shapePreview.y2);
      const w = (x2 - x1 + 1) * cell;
      const h = (y2 - y1 + 1) * cell;
      const colorIndex = shapePreview.colorIndex | 0;
      const c = colorIndex === 0 ? 'rgba(255,255,255,0.35)' : (palette[colorIndex - 1] || '#ffffff');
      if (shapePreview.kind === 'rectFill') {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = c;
        ctx.fillRect(x1 * cell, y1 * cell, w, h);
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1 * cell + 1, y1 * cell + 1, w - 2, h - 2);
      ctx.restore();
    }
  }

  useEffect(() => {
    if (!open) return;
    drawCanvas();
  }, [open, pixels, size, palette, shapePreview]);

  function paintAt(x, y) {
    const idx = y * size + x;
    const next = new Uint8Array(pixels);
    next[idx] = tool === 'erase' ? 0 : selectedColor;
    setPixels(next);
  }

  function applyRect(kind, x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const next = new Uint8Array(pixels);
    const color = selectedColor;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const isEdge = x === minX || x === maxX || y === minY || y === maxY;
        if (kind === 'rectOutline' && !isEdge) continue;
        next[y * size + x] = color;
      }
    }
    setPixels(next);
  }

  function floodFill(startX, startY) {
    const targetIdx = startY * size + startX;
    const targetColor = pixels[targetIdx];
    const newColor = selectedColor;
    if (targetColor === newColor) return;
    const next = new Uint8Array(pixels);
    const stack = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const idx = y * size + x;
      if (next[idx] !== targetColor) continue;
      next[idx] = newColor;
      if (x > 0) stack.push([x - 1, y]);
      if (x < size - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]);
      if (y < size - 1) stack.push([x, y + 1]);
    }
    setPixels(next);
  }

  function handleDown(e) {
    e.preventDefault();
    const cellPos = getCellFromEvent(e);
    if (!cellPos) return;
    if (tool === 'fill') {
      floodFill(cellPos.x, cellPos.y);
      return;
    }
    dragRef.current.down = true;
    dragRef.current.startX = cellPos.x;
    dragRef.current.startY = cellPos.y;
    if (tool === 'rectFill' || tool === 'rectOutline') {
      setShapePreview({ kind: tool, x1: cellPos.x, y1: cellPos.y, x2: cellPos.x, y2: cellPos.y, colorIndex: selectedColor });
      return;
    }
    paintAt(cellPos.x, cellPos.y);
  }

  function handleMove(e) {
    if (!dragRef.current.down) return;
    e.preventDefault();
    const cellPos = getCellFromEvent(e);
    if (!cellPos) return;
    if (tool === 'rectFill' || tool === 'rectOutline') {
      setShapePreview((prev) => prev ? ({ ...prev, x2: cellPos.x, y2: cellPos.y, colorIndex: selectedColor }) : prev);
      return;
    }
    paintAt(cellPos.x, cellPos.y);
  }

  function handleUp() {
    if (dragRef.current.down && (tool === 'rectFill' || tool === 'rectOutline') && shapePreview) {
      applyRect(shapePreview.kind, shapePreview.x1, shapePreview.y1, shapePreview.x2, shapePreview.y2);
      setShapePreview(null);
    }
    dragRef.current.down = false;
  }

  function handleSave() {
    const trimmed = name.trim().slice(0, 24);
    if (!trimmed) return;
    const base64 = encodePixelsToBase64(pixels);
    const cleanExtras = extraColors
      .map((c) => String(c || '').trim())
      .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
    onCreateBlock?.({ name: trimmed, size, pixels: base64, palette: cleanExtras, category });
  }

  function handleClear() {
    setPixels(makeEmpty(size));
    setShapePreview(null);
  }

  function handleAddCustomColor() {
    const hex = String(customColor || '').trim().toLowerCase();
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    if (BASE_PALETTE.includes(hex) || extraColors.includes(hex)) {
      const idx = [...BASE_PALETTE, ...extraColors].indexOf(hex);
      if (idx >= 0) setSelectedColor(idx);
      return;
    }
    setExtraColors((prev) => {
      const next = [...prev, hex];
      setSelectedColor(BASE_PALETTE.length + next.length - 1);
      return next;
    });
  }

  function handleAddBlock(block) {
    if (!block?.id) return;
    onAddToInventory?.(block.id);
  }

  const [showCreate, setShowCreate] = useState(false);

  if (!open) return null;

  return (
    <div className="find-overlay" role="dialog" aria-modal="true" aria-label="Find blocks">
      <div className="find-modal">
        <div className="find-top">
          <div className="find-title">Find blocks</div>
          <button type="button" className="find-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="find-body">
          <div className="find-left">
            <div className="find-search">
              <input
                className="find-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search blocks..."
              />
              <button
                type="button"
                className="find-new-btn"
                onClick={() => setShowCreate(true)}
              >
                +
              </button>
            </div>
            <div className="find-list">
              {filtered.map((b) => (
                <div key={b.id} className="find-item">
                  <div className="find-item-preview">
                    {b.pixels ? (
                      <span
                        className="find-item-preview-img"
                        style={{ backgroundImage: `url(${getPreview(b) || ''})` }}
                      />
                    ) : null}
                  </div>
                  <div className="find-item-main">
                    <div className="find-item-name">{b.name}</div>
                    <div className="find-item-meta">
                      {b.size}×{b.size}
                      {b.category ? ` · ${b.category}` : ''}
                    </div>
                  </div>
                  <button type="button" className="find-item-add" onClick={() => handleAddBlock(b)}>
                    Add
                  </button>
                </div>
              ))}
              {!filtered.length && <div className="find-empty">No blocks found.</div>}
            </div>
          </div>
          <div className="find-right">
            {showCreate && (
            <div className="find-section">
              <div className="find-section-title">Create block</div>
              <div className="find-row">
                <label className="find-label">Name</label>
                <input className="find-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Stone" />
              </div>
              <div className="find-row">
                <span className="find-label">Category</span>
                <div className="find-pill-group" role="group" aria-label="Block category">
                  <button
                    type="button"
                    className={`find-pill ${category === 'wallpaper' ? 'is-active' : ''}`}
                    onClick={() => setCategory('wallpaper')}
                  >
                    Wallpaper
                  </button>
                  <button
                    type="button"
                    className={`find-pill ${category === 'block' ? 'is-active' : ''}`}
                    onClick={() => setCategory('block')}
                  >
                    Block
                  </button>
                  <button
                    type="button"
                    className={`find-pill ${category === 'decoration' ? 'is-active' : ''}`}
                    onClick={() => setCategory('decoration')}
                  >
                    Decoration
                  </button>
                </div>
              </div>
              <div className="find-row find-row-inline">
                <div className="find-tool">
                  <button type="button" className={`find-tool-btn ${tool === 'paint' ? 'is-active' : ''}`} onClick={() => setTool('paint')}>Paint</button>
                  <button type="button" className={`find-tool-btn ${tool === 'erase' ? 'is-active' : ''}`} onClick={() => setTool('erase')}>Erase</button>
                  <button type="button" className={`find-tool-btn ${tool === 'fill' ? 'is-active' : ''}`} onClick={() => setTool('fill')}>Fill</button>
                  <button type="button" className={`find-tool-btn ${tool === 'rectFill' ? 'is-active' : ''}`} onClick={() => setTool('rectFill')}>Square</button>
                  <button type="button" className={`find-tool-btn ${tool === 'rectOutline' ? 'is-active' : ''}`} onClick={() => setTool('rectOutline')}>Outline</button>
                </div>
                <div className="find-actions">
                  <button type="button" className="find-clear" onClick={handleClear}>
                    Clear
                  </button>
                  <button type="button" className="find-save" onClick={handleSave} disabled={!name.trim()}>
                    Save
                  </button>
                </div>
              </div>
              <div className="find-editor">
                <canvas
                  ref={canvasRef}
                  className="find-canvas"
                  width={canvasW}
                  height={canvasH}
                  onMouseDown={handleDown}
                  onMouseMove={handleMove}
                  onMouseUp={handleUp}
                  onMouseLeave={handleUp}
                  onTouchStart={handleDown}
                  onTouchMove={handleMove}
                  onTouchEnd={handleUp}
                  onTouchCancel={handleUp}
                />
              </div>
              <div className="find-palette">
                <button
                  type="button"
                  className={`find-swatch find-swatch--transparent ${selectedColor === 0 ? 'is-active' : ''}`}
                  onClick={() => setSelectedColor(0)}
                  aria-label="Transparent"
                />
                {palette.map((c, idx) => {
                  const index = idx + 1; // shift by 1 because 0 is transparent
                  return (
                    <button
                      key={`${c}-${index}`}
                      type="button"
                      className={`find-swatch ${index === selectedColor ? 'is-active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setSelectedColor(index)}
                      aria-label={`Color ${index}`}
                    />
                  );
                })}
              </div>
              <div className="find-palette-custom">
                <input
                  type="color"
                  className="find-palette-input"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  aria-label="Custom color"
                />
                <button
                  type="button"
                  className="find-palette-add"
                  onClick={handleAddCustomColor}
                >
                  Add color
                </button>
              </div>
              <div className="find-hint">Tip: create blocks here, then Add them to your inventory to place in the world.</div>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

