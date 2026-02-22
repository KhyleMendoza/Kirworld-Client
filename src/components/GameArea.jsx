import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import WorldCanvas from './WorldCanvas';
import DPad from './DPad';
import ZoomControls from './ZoomControls';
import ChatBox from './ChatBox';
import '../styles/GameArea.css';

const SEND_RATE_MS = 80;
const INTERPOLATION_SPEED = 0.2;
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2400;
const PLAYER_SIZE = 48;
const PLAYER_SPEED = 5; // must match server (per move packet)
const PIXELS_PER_SECOND = (PLAYER_SPEED / SEND_RATE_MS) * 1000; // smooth movement speed
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.2;

// Order matches atan2(dy,dx)+PI in steps of PI/4: west, sw, north, se, east, ne, south, nw
const IDLE_AFK_MS = 10000;

const ROTATION_NAMES = ['west', 'south-west', 'north', 'south-east', 'east', 'north-east', 'south', 'north-west'];

function directionFromDxDy(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  const angle = Math.atan2(dy, dx);
  const index = Math.round((angle + Math.PI) / (Math.PI / 4)) % 8;
  return ROTATION_NAMES[index];
}

export default function GameArea({ playerName }) {
  const socketRef = useRef(null);
  const myIdRef = useRef(null);
  const [players, setPlayers] = useState([]);
  const [zoom, setZoom] = useState(1);
  const keysRef = useRef({ w: false, a: false, s: false, d: false });
  const sendIntervalRef = useRef(null);
  const [displayPlayers, setDisplayPlayers] = useState([]);
  const [messages, setMessages] = useState([]);
  const myLastDirRef = useRef('south');
  const lastPosRef = useRef({});
  const otherDirectionsRef = useRef({});
  const otherMovingUntilRef = useRef({});
  const myLastMoveTimeRef = useRef(Date.now());
  const otherLastMoveTimeRef = useRef({});
  const [, setMovingTick] = useState(0);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const predictedPosRef = useRef({ x: null, y: null });
  const lastPredTimeRef = useRef(performance.now());
  const [, setSmoothTick] = useState(0);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Connect and join (use VITE_WS_URL in production)
  const serverUrl = import.meta.env.VITE_WS_URL || window.location.origin;
  useEffect(() => {
    const socket = io(serverUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', playerName);
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('joined', ({ id }) => {
      myIdRef.current = id;
      predictedPosRef.current = { x: null, y: null };
    });

    socket.on('players', (list) => {
      const now = Date.now();
      const myId = myIdRef.current;
      list.forEach((p) => {
        if (p.id === myId) {
          predictedPosRef.current = { x: p.x, y: p.y };
        }
        const prev = lastPosRef.current[p.id];
        const dx = prev != null ? p.x - prev.x : 0;
        const dy = prev != null ? p.y - prev.y : 0;
        const dir = directionFromDxDy(dx, dy);
        if (dir) otherDirectionsRef.current[p.id] = dir;
        if (dx !== 0 || dy !== 0) {
          otherMovingUntilRef.current[p.id] = now + 220;
          otherLastMoveTimeRef.current[p.id] = now;
        }
        if (prev == null) otherLastMoveTimeRef.current[p.id] = now;
        lastPosRef.current[p.id] = { x: p.x, y: p.y };
      });
      setPlayers(list);
      setTimeout(() => setMovingTick((t) => t + 1), 250);
    });

    socket.on('chat', (msg) => {
      setMessages((prev) => [...prev.slice(-99), msg]);
    });

    if (socket.connected) socket.emit('join', playerName);

    return () => {
      socket.disconnect();
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, [playerName, serverUrl]);

  // Smooth per-frame prediction (character + camera move every frame)
  useEffect(() => {
    function clamp(v, min, max) {
      return Math.min(Math.max(v, min), max);
    }
    let rafId;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(now - lastPredTimeRef.current, 100);
      lastPredTimeRef.current = now;
      const k = keysRef.current;
      const dx = (k.d ? 1 : 0) - (k.a ? 1 : 0);
      const dy = (k.s ? 1 : 0) - (k.w ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        const pred = predictedPosRef.current;
        const x0 = pred.x ?? WORLD_WIDTH / 2 - PLAYER_SIZE / 2;
        const y0 = pred.y ?? WORLD_HEIGHT / 2 - PLAYER_SIZE / 2;
        const step = PIXELS_PER_SECOND * (dt / 1000);
        predictedPosRef.current = {
          x: clamp(x0 + dx * step, 0, WORLD_WIDTH - PLAYER_SIZE),
          y: clamp(y0 + dy * step, 0, WORLD_HEIGHT - PLAYER_SIZE),
        };
        setSmoothTick((t) => t + 1);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Throttled send movement to server only (position updated every frame by smooth loop)
  useEffect(() => {
    sendIntervalRef.current = setInterval(() => {
      const socket = socketRef.current;
      const k = keysRef.current;
      const dx = (k.d ? 1 : 0) - (k.a ? 1 : 0);
      const dy = (k.s ? 1 : 0) - (k.w ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        if (socket?.connected) socket.emit('move', { dx, dy });
        const dir = directionFromDxDy(dx, dy);
        if (dir) myLastDirRef.current = dir;
        myLastMoveTimeRef.current = Date.now();
      }
    }, SEND_RATE_MS);
    return () => {
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, []);

  // Keyboard: WASD + Arrow keys (ignored when chat input is focused)
  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const k = keysRef.current;
    const down = (e) => {
      if (isInputFocused()) return;
      const key = e.key?.toLowerCase();
      if (key === 'w' || key === 'arrowup') k.w = true;
      if (key === 's' || key === 'arrowdown') k.s = true;
      if (key === 'a' || key === 'arrowleft') k.a = true;
      if (key === 'd' || key === 'arrowright') k.d = true;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
    };
    const up = (e) => {
      if (isInputFocused()) return;
      const key = e.key?.toLowerCase();
      if (key === 'w' || key === 'arrowup') k.w = false;
      if (key === 's' || key === 'arrowdown') k.s = false;
      if (key === 'a' || key === 'arrowleft') k.a = false;
      if (key === 'd' || key === 'arrowright') k.d = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Interpolate display positions toward server positions
  useEffect(() => {
    if (!players.length) {
      setDisplayPlayers([]);
      return;
    }
    let raf;
    const interpolate = () => {
      setDisplayPlayers((prev) => {
        return players.map((p) => {
          const cur = prev.find((x) => x.id === p.id) || { displayX: p.x, displayY: p.y };
          const displayX = cur.displayX + (p.x - cur.displayX) * INTERPOLATION_SPEED;
          const displayY = cur.displayY + (p.y - cur.displayY) * INTERPOLATION_SPEED;
          return { ...p, displayX, displayY };
        });
      });
      raf = requestAnimationFrame(interpolate);
    };
    raf = requestAnimationFrame(interpolate);
    return () => cancelAnimationFrame(raf);
  }, [players]);

  const handleDPad = useCallback((dx, dy) => {
    keysRef.current.w = dy === -1;
    keysRef.current.s = dy === 1;
    keysRef.current.a = dx === -1;
    keysRef.current.d = dx === 1;
    if (dx !== 0 || dy !== 0) {
      const socket = socketRef.current;
      if (socket?.connected) socket.emit('move', { dx, dy });
      const dir = directionFromDxDy(dx, dy);
      if (dir) myLastDirRef.current = dir;
      myLastMoveTimeRef.current = Date.now();
    }
  }, []);

  const handleZoom = useCallback((delta) => {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
  }, []);

  // Desktop: mouse wheel zoom (skip when over chat so chat list can scroll like on mobile)
  useEffect(() => {
    const onWheel = (e) => {
      const inChat = e.target.closest?.('.chatbox, .chatbox-list');
      if (inChat) return;
      e.preventDefault();
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - (e.deltaY > 0 ? ZOOM_STEP : -ZOOM_STEP))));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  const myId = myIdRef.current;
  const pred = predictedPosRef.current;
  const displayList = displayPlayers.length ? displayPlayers : players.map((p) => ({ ...p, displayX: p.x, displayY: p.y }));
  const meFromServer = displayList.find((p) => p.id === myId);
  const myDisplayX = myId && pred.x != null ? pred.x : (meFromServer?.displayX ?? meFromServer?.x);
  const myDisplayY = myId && pred.y != null ? pred.y : (meFromServer?.displayY ?? meFromServer?.y);
  const me = meFromServer ? { ...meFromServer, displayX: myDisplayX, displayY: myDisplayY, x: myDisplayX, y: myDisplayY } : null;
  const originX = Math.round((myDisplayX ?? WORLD_WIDTH / 2) + PLAYER_SIZE / 2);
  const originY = Math.round((myDisplayY ?? WORLD_HEIGHT / 2) + PLAYER_SIZE / 2);
  const vw = viewport.w || 800;
  const vh = viewport.h || 600;

  const canvasDisplayList = displayList.map((p) => {
    const isMe = p.id === myId;
    const x = isMe && pred.x != null ? pred.x : (p.displayX ?? p.x);
    const y = isMe && pred.y != null ? pred.y : (p.displayY ?? p.y);
    const isMoving = isMe
      ? (keysRef.current.w || keysRef.current.a || keysRef.current.s || keysRef.current.d)
      : Date.now() < (otherMovingUntilRef.current[p.id] || 0);
    const lastMove = isMe ? myLastMoveTimeRef.current : (otherLastMoveTimeRef.current[p.id] ?? 0);
    const isIdle = !isMoving && (Date.now() - lastMove >= IDLE_AFK_MS);
    return {
      id: p.id,
      name: p.name,
      x: Math.round(Number(x)),
      y: Math.round(Number(y)),
      direction: isMe ? myLastDirRef.current : (otherDirectionsRef.current[p.id] || 'south'),
      isMoving: !!isMoving,
      isIdle: !!isIdle,
    };
  });

  const handleRetryConnection = useCallback(() => {
    socketRef.current?.connect();
  }, []);

  return (
    <div className="game-area">
      {!connected && (
        <div className="disconnected-overlay" role="dialog" aria-modal="true" aria-labelledby="disconnected-title">
          <div className="disconnected-modal">
            <h2 id="disconnected-title" className="disconnected-title">Disconnected</h2>
            <p className="disconnected-text">You lost connection to the server.</p>
            <button type="button" className="disconnected-retry" onClick={handleRetryConnection}>
              Retry
            </button>
          </div>
        </div>
      )}
      <div className="game-viewport">
        <WorldCanvas
          width={Math.round(vw)}
          height={Math.round(vh)}
          zoom={zoom}
          originX={originX}
          originY={originY}
          displayList={canvasDisplayList}
          myId={myId}
        />
      </div>
      <div className="player-card">
        <span className="player-card-label">KIRWORLD</span>
        <span className="player-card-name">{playerName}</span>
      </div>
      <ZoomControls onZoomIn={() => handleZoom(ZOOM_STEP)} onZoomOut={() => handleZoom(-ZOOM_STEP)} />
      <ChatBox
        messages={messages}
        onSend={(text) => socketRef.current?.emit('chat', text)}
        myId={myIdRef.current}
      />
      <DPad onDirection={handleDPad} />
    </div>
  );
}
