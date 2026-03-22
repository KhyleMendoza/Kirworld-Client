import { decodePixelsFromBase64 } from './pixelCodec';

export const BASE_BLOCK_COLORS = [
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

export function blockContentKey(block) {
  if (!block?.pixels) return '';
  const pal = Array.isArray(block.palette) ? block.palette.join('|') : '';
  const size = block.size === 64 ? 64 : 32;
  return `${size}:${block.pixels}:${pal}`;
}

export function rasterizeBlockToCanvas(block) {
  if (!block?.id || !block?.pixels) return null;
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
  return off;
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob failed'));
      },
      'image/png',
      1
    );
  });
}

export function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load PNG image'));
    };
    img.src = url;
  });
}
