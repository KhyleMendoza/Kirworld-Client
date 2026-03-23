const PERFORMANCE_MODE_KEY = 'kirworld_performance_mode';

function isCoarsePointer() {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function readStoredPerformanceMode() {
  try {
    const v = localStorage.getItem(PERFORMANCE_MODE_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch {
    return null;
  }
}

export function hasExplicitPerformancePreference() {
  return readStoredPerformanceMode() !== null;
}

export function getEffectivePerformanceMode() {
  const stored = readStoredPerformanceMode();
  if (stored !== null) return stored;
  return isCoarsePointer();
}

export function writePerformanceMode(enabled) {
  try {
    localStorage.setItem(PERFORMANCE_MODE_KEY, enabled ? '1' : '0');
  } catch {}
}

export function shouldUseIndexedBlockPngCache(performanceMode, userHasExplicitChoice) {
  if (performanceMode) return false;
  if (typeof window === 'undefined') return false;
  if (!userHasExplicitChoice) {
    try {
      if (window.matchMedia('(pointer: coarse)').matches) return false;
    } catch {}
  }
  return true;
}
