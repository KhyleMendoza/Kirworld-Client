import { useMemo, useState, useEffect, useRef } from 'react';
import { decodePixelsFromBase64 } from '../utils/pixelCodec';
import '../styles/Inventory.css';
import removeToolPng from '../assets/remove-tool.png';

const SLOT_COUNT = 30;
const HOTBAR_COUNT = 5;
const REMOVE_TOOL_ID = 'remove_tool';

const BASE_PALETTE = [
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

export default function Inventory({ slots, hotbar, selectedIndex, onSelectSlot, blocks, onAssignHotbar }) {
  const [expanded, setExpanded] = useState(false);
  const previewCacheRef = useRef(new Map());

  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key?.toLowerCase();
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if (key === 'i') {
        setExpanded((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const normalizedSlots = useMemo(() => {
    const base = Array.isArray(slots) ? slots.slice(0, SLOT_COUNT) : [];
    while (base.length < SLOT_COUNT) base.push(null);
    return base;
  }, [slots]);

  const blocksById = useMemo(() => {
    const map = new Map();
    (blocks || []).forEach((b) => map.set(b.id, b));
    return map;
  }, [blocks]);

  const hotbarItems = useMemo(() => {
    const arr = Array.from({ length: HOTBAR_COUNT }, (_, i) => hotbar?.[i] ?? null);
    return arr;
  }, [hotbar]);

  function getPreview(block) {
    if (!block?.id || !block?.pixels) return null;
    const key = `${block.id}:${block.size}:${block.pixels.length}`;
    const cached = previewCacheRef.current.get(key);
    if (cached) return cached;
    const size = block.size === 64 ? 64 : 32;
    let decoded;
    try {
      decoded = decodePixelsFromBase64(block.pixels);
    } catch {
      return null;
    }
    if (decoded.length < size * size) return null;
    const palette = Array.isArray(block.palette)
      ? [...BASE_PALETTE, ...block.palette]
      : BASE_PALETTE;
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = size;
    srcCanvas.height = size;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) return null;
    const img = srcCtx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const idx = decoded[i] | 0;
      if (idx === 0) {
        img.data[i * 4 + 3] = 0;
        continue;
      }
      const c = palette[idx - 1] || '#000000';
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      img.data[i * 4 + 0] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    srcCtx.putImageData(img, 0, 0);
    const target = 32;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = target;
    outCanvas.height = target;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return null;
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(srcCanvas, 0, 0, size, size, 0, 0, target, target);
    const url = outCanvas.toDataURL();
    previewCacheRef.current.set(key, url);
    return url;
  }

  return (
    <div className={`inventory ${expanded ? 'inventory--expanded' : ''}`}>
      <div className="inventory-hotbar">
        {hotbarItems.map((blockId, idx) => {
          const isSelected = selectedIndex != null && idx === selectedIndex;
          const block = blockId ? blocksById.get(blockId) : null;
          const preview = block ? getPreview(block) : blockId === REMOVE_TOOL_ID ? removeToolPng : null;
          return (
            <button
              key={idx}
              type="button"
              className={`inventory-slot inventory-slot--hotbar inventory-slot-btn ${isSelected ? 'inventory-slot--selected' : ''}`}
              onClick={() => onSelectSlot?.(idx)}
              aria-label={`Hotbar slot ${idx + 1}`}
              title={
                block
                  ? `${block.name} (${block.size}x${block.size})`
                  : blockId === REMOVE_TOOL_ID
                    ? 'Remove tool'
                    : `Slot ${idx + 1}`
              }
            >
              {preview ? <span className="inventory-slot-preview" style={{ backgroundImage: `url(${preview})` }} /> : null}
            </button>
          );
        })}
        <button
          type="button"
          className="inventory-toggle"
          onClick={() => setExpanded((open) => !open)}
          title={expanded ? 'Hide inventory (I)' : 'Show inventory (I)'}
        >
          {expanded ? '▾' : '▴'}
        </button>
      </div>
      <div className="inventory-panel">
        <div className="inventory-header">
          <span className="inventory-title">Inventory</span>
          <span className="inventory-count">{SLOT_COUNT} slots</span>
        </div>
        <div className="inventory-grid">
          {normalizedSlots.map((item, idx) => {
            const block = item?.type === 'block' ? blocksById.get(item.blockId) : null;
            const isRemoveTool = item?.type === 'tool' && item.toolId === REMOVE_TOOL_ID;
            const preview = block ? getPreview(block) : isRemoveTool ? removeToolPng : null;
            return (
              <button
                key={idx}
                type="button"
                className="inventory-slot inventory-slot-btn"
                title={block ? `${block.name} (${block.size}x${block.size})` : isRemoveTool ? 'Remove tool' : ''}
                onClick={() => {
                  if (block) onAssignHotbar?.(block.id);
                  else if (isRemoveTool) onAssignHotbar?.(REMOVE_TOOL_ID);
                }}
              >
                {preview ? <span className="inventory-slot-preview" style={{ backgroundImage: `url(${preview})` }} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

