import { useRef, useCallback, useEffect } from 'react';
import '../styles/Joystick.css';

export default function Joystick({ onDirection }) {
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const activeIdRef = useRef(null);

  const sendDirection = useCallback(
    (dx, dy) => {
      if (!onDirection) return;
      const normDx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
      const normDy = dy === 0 ? 0 : dy > 0 ? 1 : -1;
      onDirection(normDx, normDy);
    },
    [onDirection],
  );

  const reset = useCallback(() => {
    const knob = knobRef.current;
    if (knob) {
      knob.style.setProperty('--dx', '0px');
      knob.style.setProperty('--dy', '0px');
    }
    sendDirection(0, 0);
  }, [sendDirection]);

  const updateFromPoint = useCallback(
    (clientX, clientY) => {
      const base = baseRef.current;
      const knob = knobRef.current;
      if (!base || !knob) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const maxRadius = rect.width / 2;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      knob.style.setProperty('--dx', `${dx}px`);
      knob.style.setProperty('--dy', `${dy}px`);

      const deadZone = maxRadius * 0.3;
      if (dist < deadZone) {
        sendDirection(0, 0);
        return;
      }
      const nx = dx / dist;
      const ny = dy / dist;
      const thresh = 0.35;
      const dirX = Math.abs(nx) > thresh ? Math.sign(nx) : 0;
      const dirY = Math.abs(ny) > thresh ? Math.sign(ny) : 0;
      sendDirection(dirX, dirY);
    },
    [sendDirection],
  );

  const handleStart = useCallback(
    (e) => {
      e.preventDefault();
      if ('touches' in e) {
        const t = e.touches[0];
        if (!t) return;
        activeIdRef.current = t.identifier;
        updateFromPoint(t.clientX, t.clientY);
      } else {
        activeIdRef.current = 'mouse';
        updateFromPoint(e.clientX, e.clientY);
      }
    },
    [updateFromPoint],
  );

  const handleMove = useCallback(
    (e) => {
      if (activeIdRef.current == null) return;
      e.preventDefault();
      if ('touches' in e) {
        const touch = Array.from(e.touches).find((t) => t.identifier === activeIdRef.current);
        if (!touch) return;
        updateFromPoint(touch.clientX, touch.clientY);
      } else {
        if (activeIdRef.current !== 'mouse') return;
        updateFromPoint(e.clientX, e.clientY);
      }
    },
    [updateFromPoint],
  );

  const handleEnd = useCallback((e) => {
    if (activeIdRef.current == null) return;
    if ('changedTouches' in e) {
      const ended = Array.from(e.changedTouches).some((t) => t.identifier === activeIdRef.current);
      if (!ended) return;
    }
    activeIdRef.current = null;
    reset();
  }, [reset]);

  useEffect(() => {
    const base = baseRef.current;
    if (!base) return;
    const opts = { passive: false };
    base.addEventListener('touchstart', handleStart, opts);
    base.addEventListener('touchmove', handleMove, opts);
    base.addEventListener('touchend', handleEnd, opts);
    base.addEventListener('touchcancel', handleEnd, opts);
    base.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove, opts);
    window.addEventListener('mouseup', handleEnd);
    return () => {
      base.removeEventListener('touchstart', handleStart);
      base.removeEventListener('touchmove', handleMove);
      base.removeEventListener('touchend', handleEnd);
      base.removeEventListener('touchcancel', handleEnd);
      base.removeEventListener('mousedown', handleStart);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
    };
  }, [handleStart, handleMove, handleEnd]);

  return (
    <div className="joystick" ref={baseRef} aria-hidden>
      <div className="joystick-base">
        <div className="joystick-knob" ref={knobRef} />
      </div>
    </div>
  );
}

