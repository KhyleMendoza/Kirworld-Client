import { useEffect, useRef, useState } from 'react';
import { blockContentKey, rasterizeBlockToCanvas } from '../utils/blockRaster';
import north from '../character/rotations/north.png';
import northEast from '../character/rotations/north-east.png';
import east from '../character/rotations/east.png';
import southEast from '../character/rotations/south-east.png';
import south from '../character/rotations/south.png';
import southWest from '../character/rotations/south-west.png';
import west from '../character/rotations/west.png';
import northWest from '../character/rotations/north-west.png';
import removeToolPng from '../assets/remove-tool.png';
import dogNorth from '../dog/rotations/north.png';
import dogNorthEast from '../dog/rotations/north-east.png';
import dogEast from '../dog/rotations/east.png';
import dogSouthEast from '../dog/rotations/south-east.png';
import dogSouth from '../dog/rotations/south.png';
import dogSouthWest from '../dog/rotations/south-west.png';
import dogWest from '../dog/rotations/west.png';
import dogNorthWest from '../dog/rotations/north-west.png';

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

const DOG_ROTATION_URLS = {
  north: dogNorth,
  'north-east': dogNorthEast,
  east: dogEast,
  'south-east': dogSouthEast,
  south: dogSouth,
  'south-west': dogSouthWest,
  west: dogWest,
  'north-west': dogNorthWest,
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
const DOG_SIZE = 48;
const DOG_DRAW_Y_OFFSET = 4;
const GRID_SIZE = WORLD_TILE_SIZE;
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
    const url = DOG_ROTATION_URLS[dir];
    if (url) map.set(`dog/rot/${dir}`, await loadImage(url));
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
  dogs = [],
  dogBubbles = [],
  ghost = null,
  showGrid = false,
  forceShowGrid = false,
  showGridCoords = false,
  chatBubbles = [],
  whoPulseUntil = 0,
  blockPngImagesRef = null,
}) {
  const canvasRef = useRef(null);
  const [sprites, setSprites] = useState(null);
  const removeToolImgRef = useRef(null);
  const rafRef = useRef(null);
  const blockCacheRef = useRef(new Map());
  const propsRef = useRef({ zoom: 1, originX: 0, originY: 0, displayList: [], width: 800, height: 600, myId: null, blocks: [], placedBlocks: [], dogs: [], dogBubbles: [], ghost: null, showGrid: false, forceShowGrid: false, showGridCoords: false, chatBubbles: [], whoPulseUntil: 0, blockPngImagesRef: null });
  propsRef.current = { zoom, originX, originY, displayList, width, height, myId, blocks, placedBlocks, dogs, dogBubbles, ghost, showGrid, forceShowGrid, showGridCoords, chatBubbles, whoPulseUntil, blockPngImagesRef };

  function getBlockBitmap(block) {
    if (!block?.id || !block?.pixels) return null;
    const cacheKey = `${block.id}:${blockContentKey(block)}`;
    const cached = blockCacheRef.current.get(cacheKey);
    if (cached) return cached;
    const off = rasterizeBlockToCanvas(block);
    if (!off) return null;
    blockCacheRef.current.set(cacheKey, off);
    return off;
  }

  function getBlockDrawable(block, pngRef) {
    if (!block?.id) return null;
    const entry = pngRef?.current?.get(block.id);
    const img = entry?.img;
    if (img && img.complete && img.naturalWidth > 0 && entry.contentKey === blockContentKey(block)) {
      return img;
    }
    return getBlockBitmap(block);
  }

  useEffect(() => {
    let cancelled = false;
    loadAllSprites().then((map) => {
      if (!cancelled) setSprites(map);
    });
    loadImage(removeToolPng)
      .then((img) => {
        if (cancelled) return;
        removeToolImgRef.current = img;
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sprites || width <= 0 || height <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    function draw() {
      const { zoom: z, originX: ox, originY: oy, displayList: list, width: vw, height: vh, myId: currentMyId, blocks: blockDefs, placedBlocks: placed, dogs: dogsList, dogBubbles: dogBubbleList, ghost: ghostBlock, showGrid: showGridNow, forceShowGrid: forceShowGridNow, showGridCoords: showGridCoordsNow, chatBubbles: bubbles, whoPulseUntil: whoPulseUntilNow, blockPngImagesRef: pngRefNow } = propsRef.current;
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
      const bubblesByDog = new Map();
      for (const b of dogBubbleList || []) {
        if (!b || !b.dogId) continue;
        const arr = bubblesByDog.get(b.dogId) || [];
        arr.push(b);
        bubblesByDog.set(b.dogId, arr);
      }

      const wrapBubbleSegments = (ctx2d, rawSegments, maxBubbleWidth) => {
        const flat = [];
        for (const seg of rawSegments || []) {
          const colorSeg = typeof seg?.color === 'string' ? seg.color : '#e5e7eb';
          const textSeg = String(seg?.text || '');
          for (let i = 0; i < textSeg.length; i++) flat.push({ ch: textSeg[i], color: colorSeg });
        }
        if (flat.length === 0) return [];

        const lines = [];
        let lineChars = [];
        let lineText = '';
        for (const part of flat) {
          const probe = lineText + part.ch;
          if (lineText.length === 0 || ctx2d.measureText(probe).width <= maxBubbleWidth) {
            lineChars.push(part);
            lineText = probe;
          } else {
            lines.push(lineChars);
            lineChars = [part];
            lineText = part.ch;
          }
        }
        if (lineChars.length) lines.push(lineChars);

        return lines.map((line) => {
          const runs = [];
          let curColor = null;
          let curText = '';
          for (const it of line) {
            if (curColor == null || it.color === curColor) {
              curColor = it.color;
              curText += it.ch;
            } else {
              runs.push({ text: curText, color: curColor });
              curColor = it.color;
              curText = it.ch;
            }
          }
          if (curText) runs.push({ text: curText, color: curColor });
          const lineTextNow = runs.map((r) => r.text).join('');
          const widthNow = ctx2d.measureText(lineTextNow).width;
          return { runs, width: widthNow };
        });
      };

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
        const bmp = getBlockDrawable(def, pngRefNow);
        if (!bmp) continue;
        const sx = (pb.x - oxSnap) * blockScale + centerX;
        const sy = (pb.y - oySnap) * blockScale + centerY;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bmp, 0, 0, pb.size, pb.size, Math.round(sx), Math.round(sy), blockSizePx, blockSizePx);
        ctx.restore();
      }

      const orderedDogs = [...(dogsList || [])].sort(
        (a, b) => (Number(a?.y) || 0) - (Number(b?.y) || 0)
      );
      for (const d of orderedDogs) {
        if (!d) continue;
        const px = Math.round(Number(d.x));
        const py = Math.round(Number(d.y) + DOG_DRAW_Y_OFFSET);
        const dir = d.dir || d.direction || DEFAULT_DIR;
        const img = sprites.get(`dog/rot/${dir}`) || sprites.get(`dog/rot/${DEFAULT_DIR}`);
        if (img) {
          ctx.drawImage(img, px, py, DOG_SIZE, DOG_SIZE);
        }
      }

      for (const d of orderedDogs) {
        if (!d?.id) continue;
        const dogBubs = bubblesByDog.get(d.id);
        if (!dogBubs?.length) continue;
        const sorted = [...dogBubs].sort((a, b) => a.createdAt - b.createdAt);
        const bubble = sorted[sorted.length - 1];
        const age = now - bubble.createdAt;
        if (age >= 4000) continue;
        const life = age < 2500 ? 1 : 1 - (age - 2500) / 1500;
        if (life <= 0) continue;

        const text = String(bubble.text || 'Woof!').trim() || 'Woof!';
        const lineHeight = 16;
        const paddingX = 6;
        const paddingY = 4;
        const maxBubbleWidth = 180;
        ctx.font = '11px system-ui, sans-serif';
        const textW = Math.min(maxBubbleWidth, ctx.measureText(text).width);
        const boxWidth = textW + paddingX * 2;
        const boxHeight = lineHeight + paddingY * 2;
        const nameX = Math.round(Number(d.x) + DOG_SIZE / 2);
        const baseY = Math.round(Number(d.y) - 12);
        const boxX = Math.round(nameX - boxWidth / 2);
        const boxY = Math.round(baseY - boxHeight);
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
        ctx.fillText(text, nameX, boxY + boxHeight / 2);
        ctx.restore();
      }

          const showWhoNamesNow = typeof whoPulseUntilNow === 'number' && whoPulseUntilNow > now;
          const whoPulseTotalMs = 4000;
          const whoPulseAgeMs = showWhoNamesNow ? Math.max(0, whoPulseUntilNow - now) : 0;
          const whoPulseAlpha = showWhoNamesNow ? Math.max(0, Math.min(1, whoPulseAgeMs / whoPulseTotalMs)) : 0;

      if (ghostBlock?.blockId) {
        const def = byId.get(ghostBlock.blockId);
        const bmp = getBlockDrawable(def, pngRefNow);
        if (bmp) {
          ctx.save();
          ctx.globalAlpha = typeof ghostBlock.alpha === 'number' ? ghostBlock.alpha : 0.5;
          ctx.drawImage(bmp, Math.round(ghostBlock.x), Math.round(ghostBlock.y), ghostBlock.size, ghostBlock.size);
          ctx.restore();
        }
      } else if (ghostBlock?.kind === 'remove') {
        const gx = Math.round(ghostBlock.x);
        const gy = Math.round(ghostBlock.y);
        const gs = ghostBlock.size;
        ctx.save();
        ctx.globalAlpha = typeof ghostBlock.alpha === 'number' ? ghostBlock.alpha : 0.55;
        ctx.fillStyle = 'rgba(233,69,96,0.25)';
        ctx.fillRect(gx, gy, gs, gs);
        ctx.strokeStyle = 'rgba(233,69,96,0.9)';
        ctx.lineWidth = Math.max(1, Math.round(2 / (blockScale || 1)));
        ctx.strokeRect(gx + 0.5, gy + 0.5, gs - 1, gs - 1);
        const toolImg = removeToolImgRef.current;
        if (toolImg && toolImg.complete && toolImg.naturalWidth > 0) {
          const drawW = gs;
          const drawH = gs;
          const dx = gx;
          const dy = gy;
          ctx.globalAlpha = typeof ghostBlock.alpha === 'number' ? Math.min(1, ghostBlock.alpha) : 0.9;
          ctx.drawImage(toolImg, dx, dy, drawW, drawH);
        }
        ctx.restore();
      } else if (ghostBlock?.kind === 'dog') {
        const gx = Math.round(ghostBlock.x);
        const gy = Math.round(ghostBlock.y + DOG_DRAW_Y_OFFSET);
        const gs = DOG_SIZE;
        const dir = ghostBlock.dir || DEFAULT_DIR;
        ctx.save();
        ctx.globalAlpha = typeof ghostBlock.alpha === 'number' ? ghostBlock.alpha : 0.55;
        const img = sprites.get(`dog/rot/${dir}`) || sprites.get(`dog/rot/${DEFAULT_DIR}`);
        if (img) {
          ctx.drawImage(img, gx, gy, gs, gs);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(gx, gy, gs, gs);
        }
        ctx.restore();
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
            for (let wy = labelStartY; wy <= labelEndY; wy += g) {
              for (let wx = labelStartX; wx <= labelEndX; wx += g) {
                if (hideCoordsWhenMaxZoomOut) continue;
                const tileX = Math.floor(wx / g);
                const tileY = Math.floor(wy / g);
                const sx = Math.round((wx - oxSnap) * blockScale + halfW + tilePx / 2);
                const sy = Math.round((wy - oySnap) * blockScale + halfH + tilePx / 2);
                const tileIdText = String(tileY * WORLD_TILES_X + tileX + 1);
                const maxTextWidth = Math.max(6, tilePx - 6);
                const lines = [];
                let current = '';
                for (const ch of tileIdText) {
                  const probe = current + ch;
                  if (ctx.measureText(probe).width <= maxTextWidth || current.length === 0) {
                    current = probe;
                  } else {
                    lines.push(current);
                    current = ch;
                  }
                }
                if (current) lines.push(current);
                const lineHeight = Math.max(6, Math.round(labelFontPx * 1.05));
                const startY = sy - ((lines.length - 1) * lineHeight) / 2;
                for (let i = 0; i < lines.length; i++) {
                  ctx.fillText(lines[i], sx, startY + i * lineHeight);
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
        if (!showWhoNamesNow || p.id === currentMyId) {
          ctx.fillText(nameStr, nameX, nameY);
        } else {
          const anchorX = (nameX - oxSnap) * blockScale + centerX;
          const anchorY = (nameY - oySnap) * blockScale + centerY;
          const margin = 18;
          let bx = anchorX;
          let by = anchorY;
          const onScreen = bx >= margin && bx <= w - margin && by >= margin && by <= h - margin;
          if (!onScreen) {
            const dx = bx - centerX;
            const dy = by - centerY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (absDx < 0.001 && absDy < 0.001) {
              bx = centerX;
              by = centerY;
            } else {
              let t = Infinity;
              if (dx > 0) t = Math.min(t, (w - margin - centerX) / dx);
              else if (dx < 0) t = Math.min(t, (margin - centerX) / dx);

              if (dy > 0) t = Math.min(t, (h - margin - centerY) / dy);
              else if (dy < 0) t = Math.min(t, (margin - centerY) / dy);

              if (Number.isFinite(t) && t > 0) {
                bx = centerX + dx * t;
                by = centerY + dy * t;
              }

              bx = Math.max(margin, Math.min(w - margin, bx));
              by = Math.max(margin, Math.min(h - margin, by));
            }
          }

          const fontSize = 12;
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.imageSmoothingEnabled = false;
          ctx.font = `${fontSize}px system-ui, sans-serif`;
          const textW = ctx.measureText(nameStr).width;
          const padX = 7;
          const padY = 8;
          const bw = textW + padX * 2;
          const bh = fontSize + padY * 2;
          const x0 = bx - bw / 2;
          const y0 = by - bh / 2;

          const strokeColor = p.dev ? '#facc15' : (p.id === currentMyId ? '#ff8a9e' : 'rgba(148,163,184,0.8)');
          ctx.globalAlpha = whoPulseAlpha;
          ctx.fillStyle = 'rgba(15,23,42,0.90)';
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 1;

          const r = 6; 
          ctx.beginPath();
          ctx.moveTo(x0 + r, y0);
          ctx.lineTo(x0 + bw - r, y0);
          ctx.quadraticCurveTo(x0 + bw, y0, x0 + bw, y0 + r);
          ctx.lineTo(x0 + bw, y0 + bh - r);
          ctx.quadraticCurveTo(x0 + bw, y0 + bh, x0 + bw - r, y0 + bh);
          ctx.lineTo(x0 + r, y0 + bh);
          ctx.quadraticCurveTo(x0, y0 + bh, x0, y0 + bh - r);
          ctx.lineTo(x0, y0 + r);
          ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.globalAlpha = whoPulseAlpha;
          ctx.fillStyle = '#e5e7eb';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(nameStr, bx, by);
          ctx.restore();
        }

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
            const fallbackText = String(bubble.text || '').trim();
            const segs = Array.isArray(bubble.segments) && bubble.segments.length > 0
              ? bubble.segments
              : [{ text: fallbackText, color: bubble.color || '#e5e7eb' }];
            const lines = wrapBubbleSegments(ctx, segs, maxBubbleWidth);
            if (lines.length === 0) continue;
            const boxWidth = Math.min(maxBubbleWidth, Math.max(...lines.map((l) => l.width))) + paddingX * 2;
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
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            lines.forEach((line, j) => {
              let cx = nameX - line.width / 2;
              const cy = boxY + paddingY + lineHeight / 2 + j * lineHeight;
              line.runs.forEach((run) => {
                ctx.fillStyle = run.color || '#e5e7eb';
                ctx.fillText(run.text, cx, cy);
                cx += ctx.measureText(run.text).width;
              });
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
