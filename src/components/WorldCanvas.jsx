import { useEffect, useRef, useState } from 'react';
import { decodePixelsFromBase64 } from '../utils/pixelCodec';
import north from '../character/rotations/north.png';
import northEast from '../character/rotations/north-east.png';
import east from '../character/rotations/east.png';
import southEast from '../character/rotations/south-east.png';
import south from '../character/rotations/south.png';
import southWest from '../character/rotations/south-west.png';
import west from '../character/rotations/west.png';
import northWest from '../character/rotations/north-west.png';

const ROTATION_URLS = {
  north,
  'north-east': northEast,
  east,
  'south-east': southEast,
  south,
  'south-west': southWest,
  west,
  'north-west': northWest,
};

const walkGlob = import.meta.glob('../character/walk/*/*.png', { eager: true, query: '?url', import: 'default' });
const idleGlob = import.meta.glob('../character/breathing-idle/*/*.png', { eager: true, query: '?url', import: 'default' });

const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const DEFAULT_DIR = 'south';
const WORLD_TILE_SIZE = 32;
const WORLD_TILES_X = 500;
const WORLD_TILES_Y = 500;
const WORLD_WIDTH = WORLD_TILES_X * WORLD_TILE_SIZE;
const WORLD_HEIGHT = WORLD_TILES_Y * WORLD_TILE_SIZE;
const PLAYER_SIZE = 48;
const GRID_SIZE = WORLD_TILE_SIZE;
const WALK_FRAME_MS = 90;
const WALK_FRAMES = 6;
const IDLE_FRAME_MS = 150;
const IDLE_FRAMES = 4;
const BASE_BLOCK_COLORS = [
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

function walkUrl(dir, frame) {
  const key = `../character/walk/${dir}/frame_${String(frame).padStart(3, '0')}.png`;
  return walkGlob[key] ?? null;
}
function idleUrl(dir, frame) {
  const key = `../character/breathing-idle/${dir}/frame_${String(frame).padStart(3, '0')}.png`;
  return idleGlob[key] ?? null;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadAllSprites() {
  const map = new Map();
  for (const dir of DIRECTIONS) {
    const url = ROTATION_URLS[dir];
    if (url) map.set(`rot/${dir}`, await loadImage(url));
  }
  for (const dir of DIRECTIONS) {
    for (let f = 0; f < WALK_FRAMES; f++) {
      const url = walkUrl(dir, f);
      if (url) map.set(`walk/${dir}/${f}`, await loadImage(url));
    }
  }
  for (const dir of DIRECTIONS) {
    for (let f = 0; f < IDLE_FRAMES; f++) {
      const url = idleUrl(dir, f);
      if (url) map.set(`idle/${dir}/${f}`, await loadImage(url));
    }
  }
  return map;
}

function getSpriteKey(direction, isMoving, isIdle) {
  const dir = direction || DEFAULT_DIR;
  const t = Date.now();
  if (isMoving) {
    const f = Math.floor(t / WALK_FRAME_MS) % WALK_FRAMES;
    return `walk/${dir}/${f}`;
  }
  if (isIdle) {
    const f = Math.floor(t / IDLE_FRAME_MS) % IDLE_FRAMES;
    return `idle/${dir}/${f}`;
  }
  return `rot/${dir}`;
}

export default function WorldCanvas({
  width,
  height,
  zoom,
  originX,
  originY,
  displayList,
  myId,
  blocks = [],
  placedBlocks = [],
  ghost = null,
  showGrid = false,
  forceShowGrid = false,
  showGridCoords = false,
  chatBubbles = [],
}) {
  const canvasRef = useRef(null);
  const [sprites, setSprites] = useState(null);
  const rafRef = useRef(null);
  const blockCacheRef = useRef(new Map());
  const propsRef = useRef({ zoom: 1, originX: 0, originY: 0, displayList: [], width: 800, height: 600, myId: null, blocks: [], placedBlocks: [], ghost: null, showGrid: false, forceShowGrid: false, showGridCoords: false, chatBubbles: [] });
  propsRef.current = { zoom, originX, originY, displayList, width, height, myId, blocks, placedBlocks, ghost, showGrid, forceShowGrid, showGridCoords, chatBubbles };

  function getBlockBitmap(block) {
    if (!block?.id || !block?.pixels) return null;
    const cacheKey = `${block.id}:${block.size}:${block.pixels.length}:${Array.isArray(block.palette) ? block.palette.join(',') : ''}`;
    const cached = blockCacheRef.current.get(cacheKey);
    if (cached) return cached;
    const size = block.size === 64 ? 64 : 32;
    const palette = Array.isArray(block.palette)
      ? [...BASE_BLOCK_COLORS, ...block.palette]
      : BASE_BLOCK_COLORS;
    let decoded;
    try {
      decoded = decodePixelsFromBase64(block.pixels);
    } catch {
      return null;
    }
    if (decoded.length < size * size) return null;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const idx = decoded[i] | 0;
      if (idx === 0) {
        img.data[i * 4 + 3] = 0;
        continue;
      }
      const color = palette[idx - 1] || '#000000';
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      img.data[i * 4 + 0] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    blockCacheRef.current.set(cacheKey, off);
    return off;
  }

  useEffect(() => {
    let cancelled = false;
    loadAllSprites().then((map) => {
      if (!cancelled) setSprites(map);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sprites || width <= 0 || height <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    function draw() {
      const { zoom: z, originX: ox, originY: oy, displayList: list, width: vw, height: vh, myId: currentMyId, blocks: blockDefs, placedBlocks: placed, ghost: ghostBlock, showGrid: showGridNow, forceShowGrid: forceShowGridNow, showGridCoords: showGridCoordsNow, chatBubbles: bubbles } = propsRef.current;
      const dprNow = Math.min(window.devicePixelRatio || 1, 2);
      const bufW = Math.round(vw * dprNow);
      const bufH = Math.round(vh * dprNow);
      if (canvas.width !== bufW || canvas.height !== bufH) {
        canvas.width = bufW;
        canvas.height = bufH;
        canvas.style.width = `${vw}px`;
        canvas.style.height = `${vh}px`;
      }
      const w = canvas.width;
      const h = canvas.height;
      const scaleSnap = Math.round(z * dprNow * GRID_SIZE) / (GRID_SIZE * dprNow);
      const oxSnap = Math.round(ox);
      const oySnap = Math.round(oy);
      const blockScale = scaleSnap * dprNow;
      const blockSizePx = Math.round(GRID_SIZE * blockScale);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0a2647';
      ctx.fillRect(0, 0, w, h);

      ctx.save();

      ctx.translate(Math.round(w / 2), Math.round(h / 2));
      ctx.scale(scaleSnap * dprNow, scaleSnap * dprNow);
      ctx.translate(-oxSnap, -oySnap);

      ctx.imageSmoothingEnabled = false;
      ctx.imageSmoothingQuality = 'low';

      const byId = new Map();
      for (const b of blockDefs || []) byId.set(b.id, b);

      const bubblesByPlayer = new Map();
      const now = Date.now();
      for (const b of bubbles || []) {
        if (!b || !b.playerId) continue;
        const arr = bubblesByPlayer.get(b.playerId) || [];
        arr.push(b);
        bubblesByPlayer.set(b.playerId, arr);
      }

      const layerIndex = (cat) => {
        if (cat === 'wallpaper') return 0;
        if (cat === 'decoration') return 1;
        return 2;
      };

      const orderedPlaced = [...(placed || [])].sort((a, b) => {
        const defA = byId.get(a.blockId);
        const defB = byId.get(b.blockId);
        const catA = defA?.category || 'block';
        const catB = defB?.category || 'block';
        return layerIndex(catA) - layerIndex(catB);
      });

      const centerX = Math.round(w / 2);
      const centerY = Math.round(h / 2);
      for (const pb of orderedPlaced) {
        const def = byId.get(pb.blockId);
        const bmp = getBlockBitmap(def);
        if (!bmp) continue;
        const sx = (pb.x - oxSnap) * blockScale + centerX;
        const sy = (pb.y - oySnap) * blockScale + centerY;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bmp, 0, 0, pb.size, pb.size, Math.round(sx), Math.round(sy), blockSizePx, blockSizePx);
        ctx.restore();
      }

      if (ghostBlock?.blockId) {
        const def = byId.get(ghostBlock.blockId);
        const bmp = getBlockBitmap(def);
        if (bmp) {
          ctx.save();
          ctx.globalAlpha = typeof ghostBlock.alpha === 'number' ? ghostBlock.alpha : 0.5;
          ctx.drawImage(bmp, Math.round(ghostBlock.x), Math.round(ghostBlock.y), ghostBlock.size, ghostBlock.size);
          ctx.restore();
        }
      }

      const shouldDrawGrid = (showGridNow || forceShowGridNow) && blockScale > 0.0001;
      if (shouldDrawGrid) {
        const g = GRID_SIZE;
        const halfW = w / 2;
        const halfH = h / 2;
        const leftWorld = oxSnap - halfW / blockScale;
        const rightWorld = oxSnap + halfW / blockScale;
        const topWorld = oySnap - halfH / blockScale;
        const bottomWorld = oySnap + halfH / blockScale;

        const clampedLeft = Math.max(0, leftWorld);
        const clampedRight = Math.min(WORLD_WIDTH, rightWorld);
        const clampedTop = Math.max(0, topWorld);
        const clampedBottom = Math.min(WORLD_HEIGHT, bottomWorld);

        const startX = Math.max(g, Math.ceil(clampedLeft / g) * g);
        const startY = Math.max(g, Math.ceil(clampedTop / g) * g);
        const endX = Math.min(WORLD_WIDTH - g, Math.floor(clampedRight / g) * g);
        const endY = Math.min(WORLD_HEIGHT - g, Math.floor(clampedBottom / g) * g);

        if (!(endX < startX || endY < startY)) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.imageSmoothingEnabled = false;
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;

          const worldLeftPx = (0 - oxSnap) * blockScale + halfW;
          const worldRightPx = (WORLD_WIDTH - oxSnap) * blockScale + halfW;
          const worldTopPx = (0 - oySnap) * blockScale + halfH;
          const worldBottomPx = (WORLD_HEIGHT - oySnap) * blockScale + halfH;
          const clipX = Math.round(Math.min(worldLeftPx, worldRightPx));
          const clipY = Math.round(Math.min(worldTopPx, worldBottomPx));
          const clipW = Math.round(Math.abs(worldRightPx - worldLeftPx));
          const clipH = Math.round(Math.abs(worldBottomPx - worldTopPx));
          ctx.beginPath();
          ctx.rect(clipX, clipY, clipW, clipH);
          ctx.clip();

          ctx.beginPath();
          for (let wx = startX; wx <= endX; wx += g) {
            const sx = Math.round((wx - oxSnap) * blockScale + halfW);
            ctx.moveTo(sx + 0.5, 0);
            ctx.lineTo(sx + 0.5, h);
          }
          for (let wy = startY; wy <= endY; wy += g) {
            const sy = Math.round((wy - oySnap) * blockScale + halfH);
            ctx.moveTo(0, sy + 0.5);
            ctx.lineTo(w, sy + 0.5);
          }
          ctx.stroke();

          const borderW = Math.max(0, clipW - 1);
          const borderH = Math.max(0, clipH - 1);
          ctx.strokeRect(clipX + 0.5, clipY + 0.5, borderW, borderH);

          if (showGridCoordsNow) {
            const tilePx = g * blockScale;
            const labelFontPx = Math.max(6, Math.min(10, Math.round(tilePx * 0.2)));
            ctx.fillStyle = 'rgba(226,232,240,0.42)';
            ctx.font = `${labelFontPx}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelStartX = Math.max(0, Math.floor(clampedLeft / g) * g);
            const labelStartY = Math.max(0, Math.floor(clampedTop / g) * g);
            const labelEndX = Math.min(WORLD_WIDTH - g, Math.floor(clampedRight / g) * g);
            const labelEndY = Math.min(WORLD_HEIGHT - g, Math.floor(clampedBottom / g) * g);
            const hideCoordsWhenMaxZoomOut = z <= 0.45;
            const showTwoLineCoords = z <= 0.8;
            for (let wy = labelStartY; wy <= labelEndY; wy += g) {
              for (let wx = labelStartX; wx <= labelEndX; wx += g) {
                if (hideCoordsWhenMaxZoomOut) continue;
                const tileX = Math.floor(wx / g);
                const tileY = Math.floor(wy / g);
                const sx = Math.round((wx - oxSnap) * blockScale + halfW + tilePx / 2);
                const sy = Math.round((wy - oySnap) * blockScale + halfH + tilePx / 2);
                if (showTwoLineCoords) {
                  const lineOffset = Math.max(1, Math.round(labelFontPx * 0.55));
                  ctx.fillText(`${tileX},`, sx, sy - lineOffset);
                  ctx.fillText(`${tileY}`, sx, sy + lineOffset);
                } else {
                  ctx.fillText(`${tileX},${tileY}`, sx, sy);
                }
              }
            }
          }
          ctx.restore();
        }
      }

      const size = PLAYER_SIZE;
      for (const p of list) {
        const px = Math.round(Number(p.x));
        const py = Math.round(Number(p.y));
        const key = getSpriteKey(p.direction, p.isMoving, p.isIdle);
        const img = sprites.get(key) || sprites.get(`rot/${p.direction || DEFAULT_DIR}`) || sprites.get(`rot/${DEFAULT_DIR}`);
        if (img) {
          ctx.drawImage(img, px, py, size, size);
        }

        if (p?.showHitbox && p.id === currentMyId) {
          const inv = 1 / (scaleSnap * dprNow);
          const hitW = 20;
          const hitH = 31;
          const hitX = px + Math.round((size - hitW) / 2);
          const hitY = py + 12;
          ctx.save();
          ctx.lineWidth = inv;
          ctx.strokeStyle = 'rgba(0,255,255,0.9)';
          ctx.strokeRect(hitX, hitY, hitW, hitH);
          ctx.restore();
        }

        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = p.dev ? '#facc15' : (p.id === currentMyId ? '#ff8a9e' : '#fff');
        const nameX = Math.round(px + size / 2);
        const nameY = Math.round(py - 6);
        const nameStr = typeof p.name === 'string' ? p.name : 'Player';
        ctx.fillText(nameStr, nameX, nameY);

        const bubblesForPlayer = bubblesByPlayer.get(p.id);
        if (bubblesForPlayer && bubblesForPlayer.length) {
          const sorted = [...bubblesForPlayer].sort((a, b) => a.createdAt - b.createdAt);
          const maxVisible = 3;
          const toDraw = sorted.slice(-maxVisible);
          const baseY = nameY - 14;
          const lineHeight = 16;
          const paddingX = 6;
          const paddingY = 4;
          const maxBubbleWidth = 200;
          ctx.font = '11px system-ui, sans-serif';
          const bubbleData = [];
          for (const bubble of toDraw) {
            const age = now - bubble.createdAt;
            if (age >= 4000) continue;
            const life = age < 2500 ? 1 : 1 - (age - 2500) / 1500;
            if (life <= 0) continue;
            const raw = String(bubble.text || '').trim();
            if (!raw) continue;
            const words = raw.split(/\s+/);
            const lines = [];
            let current = '';
            for (const word of words) {
              const testLine = current ? current + ' ' + word : word;
              if (ctx.measureText(testLine).width <= maxBubbleWidth) {
                current = testLine;
                continue;
              }
              if (current) {
                lines.push(current);
                current = '';
              }
              if (ctx.measureText(word).width <= maxBubbleWidth) {
                current = word;
              } else {
                let start = 0;
                while (start < word.length) {
                  let end = start + 1;
                  while (end <= word.length && ctx.measureText(word.slice(start, end)).width <= maxBubbleWidth) end++;
                  lines.push(word.slice(start, end - 1));
                  start = end - 1;
                }
              }
            }
            if (current) lines.push(current);
            if (lines.length === 0) continue;
            const boxWidth = Math.min(maxBubbleWidth, Math.max(...lines.map((l) => ctx.measureText(l).width))) + paddingX * 2;
            const boxHeight = lines.length * lineHeight + paddingY * 2;
            bubbleData.push({ bubble, lines, boxWidth, boxHeight, life });
          }
          let bubbleBottom = baseY;
          for (let i = bubbleData.length - 1; i >= 0; i--) {
            const { lines, boxWidth, boxHeight, life } = bubbleData[i];
            const boxX = Math.round(nameX - boxWidth / 2);
            const boxY = Math.round(bubbleBottom - boxHeight);
            ctx.save();
            ctx.globalAlpha = life;
            const r = 6;
            ctx.beginPath();
            ctx.moveTo(boxX + r, boxY);
            ctx.lineTo(boxX + boxWidth - r, boxY);
            ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + r);
            ctx.lineTo(boxX + boxWidth, boxY + boxHeight - r);
            ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - r, boxY + boxHeight);
            ctx.lineTo(boxX + r, boxY + boxHeight);
            ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - r);
            ctx.lineTo(boxX, boxY + r);
            ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
            ctx.closePath();
            ctx.fillStyle = 'rgba(15,23,42,0.9)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(148,163,184,0.8)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#e5e7eb';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            lines.forEach((line, j) => {
              ctx.fillText(line, nameX, boxY + paddingY + lineHeight / 2 + j * lineHeight);
            });
            ctx.restore();
            bubbleBottom = boxY - 4;
          }
        }
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sprites, width, height]);

  if (!sprites) {
    return (
      <div className="world-canvas-loading" style={{ width, height, background: '#0a2647', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        Loading…
      </div>
    );
  }

  return <canvas ref={canvasRef} className="world-canvas" style={{ display: 'block', width, height }} />;
}
