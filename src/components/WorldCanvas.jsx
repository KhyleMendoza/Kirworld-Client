import { useEffect, useRef, useState } from 'react';
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
const WORLD_HEIGHT = 2400;
const PLAYER_SIZE = 48;
const GRID_SIZE = 32;
const WALK_FRAME_MS = 90;
const WALK_FRAMES = 6;
const IDLE_FRAME_MS = 150;
const IDLE_FRAMES = 4;

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
}) {
  const canvasRef = useRef(null);
  const [sprites, setSprites] = useState(null);
  const rafRef = useRef(null);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const propsRef = useRef({ zoom: 1, originX: 0, originY: 0, displayList: [], width: 800, height: 600, dpr: 1, myId: null });
  propsRef.current = { zoom, originX, originY, displayList, width, height, dpr, myId };

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
      const { zoom: z, originX: ox, originY: oy, displayList: list, width: vw, height: vh, dpr: scaleFactor, myId: currentMyId } = propsRef.current;
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
      ctx.save();

      ctx.translate(w / 2, h / 2);
      ctx.scale(z * dprNow, z * dprNow);
      ctx.translate(-ox, -oy);

      ctx.imageSmoothingEnabled = false;
      ctx.imageSmoothingQuality = 'low';

      const bg = ctx.createLinearGradient(0, 0, WORLD_WIDTH * 0.4, WORLD_HEIGHT);
      bg.addColorStop(0, '#0a2647');
      bg.addColorStop(0.4, '#0f3460');
      bg.addColorStop(1, '#1a4a7a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      const g = GRID_SIZE;
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= WORLD_WIDTH; x += g) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y <= WORLD_HEIGHT; y += g) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_WIDTH, y);
        ctx.stroke();
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
        ctx.fillStyle = p.id === currentMyId ? '#ff8a9e' : '#fff';
        const nameX = Math.round(px + size / 2);
        const nameY = Math.round(py - 6);
        ctx.fillText(p.name || '', nameX, nameY);
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
