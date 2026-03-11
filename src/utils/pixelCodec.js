export function encodePixelsToBase64(pixels) {
  if (!(pixels instanceof Uint8Array)) throw new Error('pixels must be Uint8Array');
  let bin = '';
  for (let i = 0; i < pixels.length; i++) bin += String.fromCharCode(pixels[i]);
  return btoa(bin);
}

export function decodePixelsFromBase64(base64) {
  const bin = atob(String(base64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
  return out;
}

