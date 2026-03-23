export function shouldUseIndexedBlockPngCache() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return false;
  } catch {
    /* ignore */
  }
  return true;
}
