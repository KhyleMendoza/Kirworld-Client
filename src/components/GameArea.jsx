import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Player from './Player';
import DPad from './DPad';
import ZoomControls from './ZoomControls';
import ChatBox from './ChatBox';
import '../styles/GameArea.css';

const SEND_RATE_MS = 80;
const INTERPOLATION_SPEED = 0.2;
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2400;
const PLAYER_SIZE = 32;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.2;

export default function GameArea({ playerName }) {
  const socketRef = useRef(null);
  const myIdRef = useRef(null);
  const [players, setPlayers] = useState([]);
  const [zoom, setZoom] = useState(1);
  const keysRef = useRef({ w: false, a: false, s: false, d: false });
  const sendIntervalRef = useRef(null);
  const [displayPlayers, setDisplayPlayers] = useState([]);
  const [messages, setMessages] = useState([]);

  // Connect and join (use VITE_WS_URL in production)
  const serverUrl = import.meta.env.VITE_WS_URL || window.location.origin;
  useEffect(() => {
    const socket = io(serverUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('joined', ({ id }) => {
      myIdRef.current = id;
    });

    socket.on('players', (list) => {
      setPlayers(list);
    });

    socket.on('chat', (msg) => {
      setMessages((prev) => [...prev.slice(-99), msg]);
    });

    socket.emit('join', playerName);

    return () => {
      socket.disconnect();
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, [playerName, serverUrl]);

  // Throttled send movement
  useEffect(() => {
    sendIntervalRef.current = setInterval(() => {
      const socket = socketRef.current;
      if (!socket?.connected) return;
      const k = keysRef.current;
      const dx = (k.d ? 1 : 0) - (k.a ? 1 : 0);
      const dy = (k.s ? 1 : 0) - (k.w ? 1 : 0);
      if (dx !== 0 || dy !== 0) socket.emit('move', { dx, dy });
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
  const displayList = displayPlayers.length ? displayPlayers : players.map((p) => ({ ...p, displayX: p.x, displayY: p.y }));
  const me = displayList.find((p) => p.id === myId);
  const cameraX = me ? (me.displayX ?? me.x) : WORLD_WIDTH / 2 - PLAYER_SIZE / 2;
  const cameraY = me ? (me.displayY ?? me.y) : WORLD_HEIGHT / 2 - PLAYER_SIZE / 2;
  const originX = (me?.displayX ?? me?.x ?? WORLD_WIDTH / 2) + PLAYER_SIZE / 2;
  const originY = (me?.displayY ?? me?.y ?? WORLD_HEIGHT / 2) + PLAYER_SIZE / 2;

  return (
    <div className="game-area">
      <div className="game-viewport">
        <div
          className="world-wrap"
          style={{
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            transformOrigin: `${originX}px ${originY}px`,
            transform: `translate(calc(-${cameraX}px + 50vw - ${PLAYER_SIZE / 2}px), calc(-${cameraY}px + 50vh - ${PLAYER_SIZE / 2}px)) scale(${zoom})`,
          }}
        >
          {displayList.map((p) => (
            <Player
              key={p.id}
              name={p.name}
              x={p.displayX ?? p.x}
              y={p.displayY ?? p.y}
              isYou={p.id === myId}
            />
          ))}
        </div>
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
