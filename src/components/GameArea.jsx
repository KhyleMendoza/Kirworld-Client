import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getSession } from '../lib/authApi';
import WorldCanvas from './WorldCanvas';
import Joystick from './Joystick';
import ZoomControls from './ZoomControls';
import ChatBox from './ChatBox';
import Inventory from './Inventory';
import FindBlocksModal from './FindBlocksModal';
import '../styles/GameArea.css';

const SEND_RATE_MS = 60;
const INTERPOLATION_SPEED = 0.7;
const SERVER_MOVE_SPEED = 5;
const WORLD_TILE_SIZE = 32;
const WORLD_TILES_X = 500;
const WORLD_TILES_Y = 500;
const WORLD_WIDTH = WORLD_TILES_X * WORLD_TILE_SIZE;
const WORLD_HEIGHT = WORLD_TILES_Y * WORLD_TILE_SIZE;
const PLAYER_SIZE = 48;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.2;

const IDLE_AFK_MS = 10000;
const INVENTORY_SLOTS = 30;
const HOTBAR_SLOTS = 5;

const ROTATION_NAMES = ['west', 'south-west', 'north', 'south-east', 'east', 'north-east', 'south', 'north-west'];

function directionFromDxDy(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  const angle = Math.atan2(dy, dx);
  const index = Math.round((angle + Math.PI) / (Math.PI / 4)) % 8;
  return ROTATION_NAMES[index];
}

export default function GameArea({ playerName, onLogout, onSessionRevoked }) {
  const socketRef = useRef(null);
  const myIdRef = useRef(null);
  const [displayName, setDisplayName] = useState(playerName);
  const [players, setPlayers] = useState([]);
  const [zoom, setZoom] = useState(1);
  const keysRef = useRef({ w: false, a: false, s: false, d: false });
  const lastJoystickSentRef = useRef({ dx: 0, dy: 0 });
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
  const [connected, setConnected] = useState(true);
  const [characterReady, setCharacterReady] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [placedBlocks, setPlacedBlocks] = useState([]);
  const [findOpen, setFindOpen] = useState(false);
  const [snapSize, setSnapSize] = useState(32);
  const [inventorySlots, setInventorySlots] = useState(() => Array.from({ length: INVENTORY_SLOTS }, () => null));
  const [hotbar, setHotbar] = useState([]);
  const [selectedHotbar, setSelectedHotbar] = useState(null);
  const [isDev, setIsDev] = useState(false);
  const viewportRef = useRef(null);
  const placingRef = useRef(false);
  const lastPointerRef = useRef({ x: null, y: null, ok: false });
  const lastPlaceCellRef = useRef({ x: null, y: null });
  const [ghost, setGhost] = useState(null);
  const [chatBubbles, setChatBubbles] = useState([]);
  const lastMoveSentRef = useRef({ dx: 0, dy: 0 });
  const [pullOverlay, setPullOverlay] = useState(null);
  const [whoPulseUntil, setWhoPulseUntil] = useState(0);

  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const serverUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || window.location.origin;
  useEffect(() => {
    setDisplayName(playerName);
  }, [playerName]);

  useEffect(() => {
    setCharacterReady(false);
    const socket = io(serverUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    const session = getSession();
    const payload = { name: String(playerName ?? 'Player'), token: session?.token ?? null };

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', payload);
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('session_revoked', () => {
      onSessionRevoked?.();
    });
    socket.on('join_failed', () => {
      onSessionRevoked?.();
    });

    socket.on('joined', ({ id, x, y, name }) => {
      myIdRef.current = id;
      if (typeof x === 'number' && typeof y === 'number') {
        lastPosRef.current[id] = { x, y };
      }
      if (typeof name === 'string' && name.trim()) {
        setDisplayName(name);
      }
      setCharacterReady(true);
    });

    socket.on('players', (list) => {
      const now = Date.now();
      list.forEach((p) => {
        const prev = lastPosRef.current[p.id];
        const dx = prev != null ? p.x - prev.x : 0;
        const dy = prev != null ? p.y - prev.y : 0;
        const serverDir = typeof p.dir === 'string' ? p.dir : null;
        const dir = serverDir || directionFromDxDy(dx, dy);
        if (dir) otherDirectionsRef.current[p.id] = dir;
        if (p.moving || dx !== 0 || dy !== 0) {
          otherMovingUntilRef.current[p.id] = now + 220;
          otherLastMoveTimeRef.current[p.id] = now;
        }
        if (prev == null) otherLastMoveTimeRef.current[p.id] = now;
        lastPosRef.current[p.id] = { x: p.x, y: p.y };
      });
      setPlayers(list);
      const meNow = myIdRef.current ? list.find((x) => x.id === myIdRef.current) : null;
      setIsDev(!!meNow?.dev);
      setTimeout(() => setMovingTick((t) => t + 1), 250);
    });

    socket.on('chat', (msg) => {
      if (msg.system && msg.id === myIdRef.current) return;
      setMessages((prev) => [...prev.slice(-99), msg]);
      if (!msg.system && msg.id && typeof msg.text === 'string' && msg.text.trim()) {
        const now = Date.now();
        const text = msg.text.trim();
        const color = typeof msg.color === 'string' ? msg.color : '#e5e7eb';
        const segments = Array.isArray(msg.segments)
          ? msg.segments
              .map((s) => ({ text: String(s?.text || ''), color: typeof s?.color === 'string' ? s.color : color }))
              .filter((s) => s.text.length > 0)
          : [];
        setChatBubbles((prev) => {
          const next = [...prev, { key: `${msg.id}-${now}`, playerId: msg.id, text, color, segments, createdAt: now }];
          const grouped = new Map();
          for (const b of next) {
            if (!b.playerId) continue;
            const arr = grouped.get(b.playerId) || [];
            arr.push(b);
            grouped.set(b.playerId, arr);
          }
          const limited = [];
          const MAX_PER_PLAYER = 3;
          for (const arr of grouped.values()) {
            arr.sort((a, b) => a.createdAt - b.createdAt);
            const keep = arr.slice(-MAX_PER_PLAYER);
            limited.push(...keep);
          }
          return limited;
        });
      }
    });

    socket.on('blocks:list', ({ blocks: list }) => {
      if (Array.isArray(list)) setBlocks(list);
    });
    socket.on('blocks:placed', ({ placed }) => {
      if (Array.isArray(placed)) setPlacedBlocks(placed);
    });
    socket.on('blocks:placed:remove', ({ ids }) => {
      if (!Array.isArray(ids) || ids.length === 0) return;
      const set = new Set(ids);
      setPlacedBlocks((prev) => prev.filter((p) => !set.has(p.id)));
    });
    socket.on('blocks:placed:add', ({ placedBlock }) => {
      if (!placedBlock?.id) return;
      setPlacedBlocks((prev) => {
        const next = prev.filter(
          (p) => p.id !== placedBlock.id && !(p.x === placedBlock.x && p.y === placedBlock.y && String(p.id).startsWith('opt-'))
        );
        next.push(placedBlock);
        return next;
      });
    });
    socket.on('blocks:error', ({ message }) => {
      setPlacedBlocks((prev) => prev.filter((p) => !String(p.id).startsWith('opt-')));
      setMessages((prev) => [...prev.slice(-99), { id: 'system', name: 'System:', text: String(message || 'Error'), system: true }]);
    });

    socket.on('pulled', ({ byName }) => {
      const by = typeof byName === 'string' && byName.trim() ? byName.trim() : 'someone';
      setPullOverlay({ text: `You have been pulled by ${by}.`, key: `${Date.now()}-${Math.random().toString(16).slice(2)}` });
    });

    if (socket.connected) socket.emit('join', payload);

    return () => {
      socket.disconnect();
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, [playerName, serverUrl]);

  useEffect(() => {
    if (!pullOverlay) return;
    const t = setTimeout(() => setPullOverlay(null), 3500);
    return () => clearTimeout(t);
  }, [pullOverlay]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setChatBubbles((prev) => prev.filter((b) => now - b.createdAt < 4000));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    sendIntervalRef.current = setInterval(() => {
      const socket = socketRef.current;
      const k = keysRef.current;
      const dx = (k.d ? 1 : 0) - (k.a ? 1 : 0);
      const dy = (k.s ? 1 : 0) - (k.w ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        if (socket?.connected) socket.emit('move', { dx, dy });
        lastMoveSentRef.current = { dx, dy };
        const dir = directionFromDxDy(dx, dy);
        if (dir) myLastDirRef.current = dir;
        myLastMoveTimeRef.current = Date.now();
        return;
      }
      const last = lastMoveSentRef.current;
      if ((last.dx !== 0 || last.dy !== 0) && socket?.connected) {
        socket.emit('move', { dx: 0, dy: 0 });
        lastMoveSentRef.current = { dx: 0, dy: 0 };
      }
    }, SEND_RATE_MS);
    return () => {
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, []);

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
      if (key && ['1', '2', '3', '4', '5'].includes(key)) {
        const idx = Number(key) - 1;
        setSelectedHotbar((prev) => (prev === idx ? null : idx));
        e.preventDefault();
        return;
      }
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
      const dir = directionFromDxDy(dx, dy);
      if (dir) myLastDirRef.current = dir;
      myLastMoveTimeRef.current = Date.now();
      const last = lastJoystickSentRef.current;
      if (last.dx !== dx || last.dy !== dy) {
        lastJoystickSentRef.current = { dx, dy };
        const socket = socketRef.current;
        if (socket?.connected) socket.emit('move', { dx, dy });
      }
    } else {
      lastJoystickSentRef.current = { dx: 0, dy: 0 };
    }
  }, []);

  const handleZoom = useCallback((delta) => {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
  }, []);

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
  const myDisplayX = me?.displayX ?? me?.x ?? WORLD_WIDTH / 2 - PLAYER_SIZE / 2;
  const myDisplayY = me?.displayY ?? me?.y ?? WORLD_HEIGHT / 2 - PLAYER_SIZE / 2;

  const vw = viewport.w || 800;
  const vh = viewport.h || 600;

  let originX = Math.round(myDisplayX + PLAYER_SIZE / 2);
  let originY = Math.round(myDisplayY + PLAYER_SIZE / 2);

  if (zoom > 0) {
    const snappedZoom = Math.max(0.01, Math.round(zoom * WORLD_TILE_SIZE) / WORLD_TILE_SIZE);
    const halfViewWorldW = vw / (2 * snappedZoom);
    const halfViewWorldH = vh / (2 * snappedZoom);
    if (WORLD_WIDTH > 0) {
      if (WORLD_WIDTH <= halfViewWorldW * 2) {
        originX = WORLD_WIDTH / 2;
      } else {
        const minOx = halfViewWorldW;
        const maxOx = WORLD_WIDTH - halfViewWorldW;
        originX = Math.max(minOx, Math.min(maxOx, originX));
      }
    }
    if (WORLD_HEIGHT > 0) {
      if (WORLD_HEIGHT <= halfViewWorldH * 2) {
        originY = WORLD_HEIGHT / 2;
      } else {
        const minOy = halfViewWorldH;
        const maxOy = WORLD_HEIGHT - halfViewWorldH;
        originY = Math.max(minOy, Math.min(maxOy, originY));
      }
    }
  }

  const worldTilesX = Math.floor(WORLD_WIDTH / WORLD_TILE_SIZE);
  const worldTilesY = Math.floor(WORLD_HEIGHT / WORLD_TILE_SIZE);
  const worldTilesTotal = worldTilesX * worldTilesY;

  const canvasDisplayList = displayList.map((p) => {
    const isMe = p.id === myId;
    const x = p.displayX ?? p.x;
    const y = p.displayY ?? p.y;
    let isMoving;
    if (isMe) {
      const k = keysRef.current;
      const dx = (k.d ? 1 : 0) - (k.a ? 1 : 0);
      const dy = (k.s ? 1 : 0) - (k.w ? 1 : 0);
      isMoving = dx !== 0 || dy !== 0;
    } else {
      isMoving = Date.now() < (otherMovingUntilRef.current[p.id] || 0);
    }
    const lastMove = isMe ? myLastMoveTimeRef.current : (otherLastMoveTimeRef.current[p.id] ?? 0);
    const isIdle = !isMoving && (Date.now() - lastMove >= IDLE_AFK_MS);
    return {
      id: p.id,
      name: typeof p.name === 'string' ? p.name : 'Player',
      dev: !!p.dev,
      showHitbox: !!p.showHitbox,
      showGridDebug: !!p.showGridDebug,
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

  const selectedBlockId = selectedHotbar != null ? (hotbar[selectedHotbar] ?? null) : null;
  const selectedBlock = selectedBlockId ? blocks.find((b) => b.id === selectedBlockId) : null;
  const myCanvasPlayer = canvasDisplayList.find((p) => p.id === myId);
  const debugShowGrid = !!myCanvasPlayer?.showGridDebug;
  const showGrid = !!selectedBlock;

  const handleOpenFind = useCallback(() => {
    if (!isDev) {
      setMessages((prev) => [
        ...prev.slice(-99),
        { id: 'system', name: 'System:', text: 'You do not have permission to use this.', system: true },
      ]);
      return;
    }
    socketRef.current?.emit('blocks:list');
    setFindOpen(true);
  }, [isDev]);

  const handleCreateBlock = useCallback((payload) => {
    socketRef.current?.emit('blocks:create', payload);
  }, []);

  const handleAddBlockToInventory = useCallback((blockId) => {
    setInventorySlots((prev) => {
      const alreadyHas = prev.some((item) => item?.type === 'block' && item.blockId === blockId);
      if (alreadyHas) return prev;
      const next = prev.slice();
      const idx = next.findIndex((s) => s == null);
      if (idx === -1) return prev;
      next[idx] = { type: 'block', blockId };
      return next;
    });
    setHotbar((prev) => {
      if (prev.includes(blockId)) return prev;
      if (prev.length >= HOTBAR_SLOTS) {
        const without = prev.filter((id) => id !== blockId);
        const next = [blockId, ...without].slice(0, HOTBAR_SLOTS);
        setSelectedHotbar(0);
        return next;
      }
      const next = prev.concat(blockId);
      setSelectedHotbar(next.length - 1);
      return next;
    });
  }, []);

  const handleAssignHotbar = useCallback((blockId) => {
    setHotbar((prev) => {
      const without = prev.filter((id) => id !== blockId);
      const candidate = blockId;
      const next = [candidate, ...without].slice(0, HOTBAR_SLOTS);
      setSelectedHotbar(0);
      return next;
    });
  }, []);

  const computeWorldFromClient = useCallback((clientX, clientY) => {
    const vwNow = viewport.w || 800;
    const vhNow = viewport.h || 600;
    const worldX = originX + (clientX - vwNow / 2) / zoom;
    const worldY = originY + (clientY - vhNow / 2) / zoom;
    return { worldX, worldY };
  }, [originX, originY, viewport.w, viewport.h, zoom]);

  const clampPlacement = useCallback((x, y, size) => {
    const maxX = Math.max(0, WORLD_WIDTH - size);
    const maxY = Math.max(0, WORLD_HEIGHT - size);
    const cx = Math.min(Math.max(x, 0), maxX);
    const cy = Math.min(Math.max(y, 0), maxY);
    return { x: cx, y: cy };
  }, []);

  const updateGhostFromClient = useCallback((clientX, clientY) => {
    if (!selectedBlock || !isDev) return;
    const { worldX, worldY } = computeWorldFromClient(clientX, clientY);
    const grid = snapSize === 64 ? 64 : 32;
    const snappedX0 = Math.floor(worldX / grid) * grid;
    const snappedY0 = Math.floor(worldY / grid) * grid;
    const { x: snappedX, y: snappedY } = clampPlacement(snappedX0, snappedY0, selectedBlock.size);
    setGhost({ blockId: selectedBlock.id, x: snappedX, y: snappedY, size: selectedBlock.size, alpha: 0.55 });
  }, [selectedBlock, isDev, computeWorldFromClient, snapSize, clampPlacement]);

  const placeFromClient = useCallback((clientX, clientY) => {
    if (!selectedBlock || !isDev) return;
    const { worldX, worldY } = computeWorldFromClient(clientX, clientY);
    const grid = snapSize === 64 ? 64 : 32;
    const snappedX0 = Math.floor(worldX / grid) * grid;
    const snappedY0 = Math.floor(worldY / grid) * grid;
    const { x: snappedX, y: snappedY } = clampPlacement(snappedX0, snappedY0, selectedBlock.size);

    const last = lastPlaceCellRef.current;
    if (last.x === snappedX && last.y === snappedY) return;
    lastPlaceCellRef.current = { x: snappedX, y: snappedY };

    const optId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setPlacedBlocks((prev) => {
      const withoutCell = prev.filter(
        (p) => !(p.x === snappedX && p.y === snappedY && String(p.id).startsWith('opt-'))
      );
      return [
        ...withoutCell,
        { id: optId, blockId: selectedBlock.id, x: snappedX, y: snappedY, size: selectedBlock.size },
      ];
    });
    socketRef.current?.emit('blocks:place', { blockId: selectedBlock.id, x: snappedX, y: snappedY });
  }, [selectedBlock, isDev, computeWorldFromClient, snapSize, clampPlacement]);

  const placeFromEvent = useCallback((e) => {
    if (!selectedBlock || !isDev) return;
    const target = e.target;
    if (target && target.closest?.('.chatbox, .inventory, .find-overlay')) return;
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    if (clientX == null || clientY == null) return;
    placeFromClient(clientX, clientY);
  }, [selectedBlock, isDev, placeFromClient]);

  useEffect(() => {
    if (!selectedBlock || !isDev) return;
    let raf = 0;
    const tick = () => {
      const p = lastPointerRef.current;
      if (p.ok && p.x != null && p.y != null) {
        updateGhostFromClient(p.x, p.y);
        if (placingRef.current) placeFromClient(p.x, p.y);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedBlock, isDev, updateGhostFromClient, placeFromClient]);

  useEffect(() => {
    if (!selectedBlock || !isDev) {
      setGhost(null);
      return;
    }
    const el = viewportRef.current;
    if (!el) return;
    const onMove = (e) => {
      const target = e.target;
      if (target && target.closest?.('.chatbox, .inventory, .find-overlay')) {
        lastPointerRef.current = { x: null, y: null, ok: false };
        setGhost(null);
        return;
      }
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      if (clientX == null || clientY == null) return;
      lastPointerRef.current = { x: clientX, y: clientY, ok: true };
      updateGhostFromClient(clientX, clientY);
      if (placingRef.current) {
        placeFromEvent(e);
      }
    };
    const onLeave = () => {
      lastPointerRef.current = { x: null, y: null, ok: false };
      lastPlaceCellRef.current = { x: null, y: null };
      setGhost(null);
      placingRef.current = false;
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onLeave);
    el.addEventListener('touchcancel', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onLeave);
      el.removeEventListener('touchcancel', onLeave);
    };
  }, [selectedBlock, isDev, placeFromEvent, updateGhostFromClient]);

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
      {!characterReady && connected && (
        <div className="character-loading-overlay" aria-live="polite">
          <div className="character-loading-modal">
            <p className="character-loading-text">Entering world…</p>
          </div>
        </div>
      )}
      {pullOverlay && (
        <div className="pull-overlay" aria-live="polite">
          <div className="pull-modal">{pullOverlay.text}</div>
        </div>
      )}
      <div
        className="game-viewport"
        ref={viewportRef}
        onMouseDown={(e) => {
          if (!selectedBlock) return;
          placingRef.current = true;
          placeFromEvent(e);
        }}
        onMouseUp={() => {
          placingRef.current = false;
        }}
        onMouseLeave={() => {
          placingRef.current = false;
        }}
        onTouchStart={(e) => {
          if (!selectedBlock) return;
          placingRef.current = true;
          placeFromEvent(e);
        }}
        onTouchEnd={() => {
          placingRef.current = false;
        }}
        onTouchCancel={() => {
          placingRef.current = false;
        }}
      >
        <WorldCanvas
          width={Math.round(vw)}
          height={Math.round(vh)}
          zoom={zoom}
          originX={originX}
          originY={originY}
          displayList={canvasDisplayList}
          myId={myId}
          blocks={blocks}
          placedBlocks={placedBlocks}
          ghost={ghost}
          showGrid={showGrid}
          forceShowGrid={debugShowGrid}
          showGridCoords={debugShowGrid}
        whoPulseUntil={whoPulseUntil}
          chatBubbles={chatBubbles}
        />
      </div>
      <div className="player-card">
        <span className="player-card-label">KIRWORLD</span>
        <span className="player-card-name">{displayName}</span>
        {onLogout && (
          <button
            type="button"
            className="player-card-logout"
            onClick={onLogout}
            title="Log out"
          >
            Log out
          </button>
        )}
      </div>
      <ZoomControls onZoomIn={() => handleZoom(ZOOM_STEP)} onZoomOut={() => handleZoom(-ZOOM_STEP)} />
      <Inventory
        slots={inventorySlots}
        selectedIndex={selectedHotbar}
        onSelectSlot={(idx) => setSelectedHotbar((prev) => (prev === idx ? null : idx))}
        blocks={blocks}
        hotbar={hotbar}
        onAssignHotbar={handleAssignHotbar}
      />
      <FindBlocksModal
        open={findOpen}
        blocks={blocks}
        onClose={() => setFindOpen(false)}
        onCreateBlock={handleCreateBlock}
        onAddToInventory={handleAddBlockToInventory}
        snapSize={snapSize}
        onChangeSnapSize={setSnapSize}
      />
      <ChatBox
        messages={messages}
        onSend={(text) => {
          const t = String(text || '').trim();
          if (t.toLowerCase() === '/who') {
            setWhoPulseUntil(Date.now() + 4000);
          }
          socketRef.current?.emit('chat', text);
        }}
        onFind={handleOpenFind}
        myId={myIdRef.current}
        playerCount={players.length}
      />
      <Joystick onDirection={handleDPad} />
    </div>
  );
}
