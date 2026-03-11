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
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 3200;
const PLAYER_SIZE = 48;
const GRID_SIZE = 32;
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
}) {
  const canvasRef = useRef(null);
  const [sprites, setSprites] = useState(null);
  const rafRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const blockCacheRef = useRef(new Map());
  const propsRef = useRef({ zoom: 1, originX: 0, originY: 0, displayList: [], width: 800, height: 600, myId: null, blocks: [], placedBlocks: [], ghost: null });
  propsRef.current = { zoom, originX, originY, displayList, width, height, myId, blocks, placedBlocks, ghost };

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

    if (!bgCanvasRef.current) {
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = WORLD_WIDTH;
      bgCanvas.height = WORLD_HEIGHT;
      const bgCtx = bgCanvas.getContext('2d');
      if (bgCtx) {
        bgCtx.imageSmoothingEnabled = false;
        const bg = bgCtx.createLinearGradient(0, 0, WORLD_WIDTH * 0.4, WORLD_HEIGHT);
        bg.addColorStop(0, '#0a2647');
        bg.addColorStop(0.4, '#0f3460');
        bg.addColorStop(1, '#1a4a7a');
        bgCtx.fillStyle = bg;
        bgCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        const g = GRID_SIZE;
        bgCtx.strokeStyle = 'rgba(255,255,255,0.04)';
        bgCtx.lineWidth = 1;
        for (let x = 0; x <= WORLD_WIDTH; x += g) {
          bgCtx.beginPath();
          bgCtx.moveTo(x, 0);
          bgCtx.lineTo(x, WORLD_HEIGHT);
          bgCtx.stroke();
        }
        for (let y = 0; y <= WORLD_HEIGHT; y += g) {
          bgCtx.beginPath();
          bgCtx.moveTo(0, y);
          bgCtx.lineTo(WORLD_WIDTH, y);
          bgCtx.stroke();
        }
      }
      bgCanvasRef.current = bgCanvas;
    }

    function draw() {
      const { zoom: z, originX: ox, originY: oy, displayList: list, width: vw, height: vh, myId: currentMyId, blocks: blockDefs, placedBlocks: placed, ghost: ghostBlock } = propsRef.current;
      const isMobile = typeof window !== 'undefined' && (vw <= 900 || 'ontouchstart' in window || navigator.maxTouchPoints > 0);
      const dprNow = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
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
      ctx.save();

      ctx.translate(w / 2, h / 2);
      ctx.scale(z * dprNow, z * dprNow);
      ctx.translate(-ox, -oy);

      ctx.imageSmoothingEnabled = false;
      ctx.imageSmoothingQuality = 'low';

      const bgCanvas = bgCanvasRef.current;
      if (bgCanvas) {
        ctx.drawImage(bgCanvas, 0, 0);
      }

      const byId = new Map();
      for (const b of blockDefs || []) byId.set(b.id, b);

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

      for (const pb of orderedPlaced) {
        const def = byId.get(pb.blockId);
        const bmp = getBlockBitmap(def);
        if (!bmp) continue;
        ctx.drawImage(bmp, Math.round(pb.x), Math.round(pb.y), pb.size, pb.size);
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

      const size = PLAYER_SIZE;
      for (const p of list) {
        const px = Math.round(Number(p.x));
        const py = Math.round(Number(p.y));
        const key = getSpriteKey(p.direction, p.isMoving, p.isIdle);
        const img = sprites.get(key) || sprites.get(`rot/${p.direction || DEFAULT_DIR}`) || sprites.get(`rot/${DEFAULT_DIR}`);
        if (img) {
          ctx.drawImage(img, px, py, size, size);
        }
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = p.dev ? '#facc15' : (p.id === currentMyId ? '#ff8a9e' : '#fff');
        const nameX = Math.round(px + size / 2);
        const nameY = Math.round(py - 6);
        const nameStr = typeof p.name === 'string' ? p.name : 'Player';
        ctx.fillText(nameStr, nameX, nameY);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sprites, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scaleFactor = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * scaleFactor);
    const h = Math.round(height * scaleFactor);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
  }, [width, height]);

  if (!sprites) {
    return (
      <div className="world-canvas-loading" style={{ width, height, background: '#0a2647', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        Loading…
      </div>
    );
  }

  return <canvas ref={canvasRef} className="world-canvas" style={{ display: 'block', width, height }} />;
}
