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
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2400;
const PLAYER_SIZE = 48;
const MIN_ZOOM = 0.5;
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
  const [ghost, setGhost] = useState(null);
  const [chatBubbles, setChatBubbles] = useState([]);

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
        setChatBubbles((prev) => {
          const next = [...prev, { key: `${msg.id}-${now}`, playerId: msg.id, text, createdAt: now }];
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

    if (socket.connected) socket.emit('join', payload);

    return () => {
      socket.disconnect();
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
    };
  }, [playerName, serverUrl]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setChatBubbles((prev) => prev.filter((b) => now - b.createdAt < 3000));
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
        const dir = directionFromDxDy(dx, dy);
        if (dir) myLastDirRef.current = dir;
        myLastMoveTimeRef.current = Date.now();
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
  const originX = Math.round(myDisplayX + PLAYER_SIZE / 2);
  const originY = Math.round(myDisplayY + PLAYER_SIZE / 2);
  const vw = viewport.w || 800;
  const vh = viewport.h || 600;

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

  const placeFromEvent = useCallback((e) => {
    if (!selectedBlock || !isDev) return;
    const target = e.target;
    if (target && target.closest?.('.chatbox, .inventory, .find-overlay')) return;
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    if (clientX == null || clientY == null) return;
    const { worldX, worldY } = computeWorldFromClient(clientX, clientY);
    const grid = snapSize === 64 ? 64 : 32;
    const snappedX = Math.round(worldX / grid) * grid;
    const snappedY = Math.round(worldY / grid) * grid;
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
  }, [selectedBlock, computeWorldFromClient, snapSize, isDev]);

  useEffect(() => {
    if (!selectedBlock || !isDev) {
      setGhost(null);
      return;
    }
    const el = viewportRef.current;
    if (!el) return;
    const onMove = (e) => {
      const target = e.target;
      if (target && target.closest?.('.chatbox, .inventory, .find-overlay')) return;
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      if (clientX == null || clientY == null) return;
      const { worldX, worldY } = computeWorldFromClient(clientX, clientY);
      const grid = snapSize === 64 ? 64 : 32;
      const snappedX = Math.round(worldX / grid) * grid;
      const snappedY = Math.round(worldY / grid) * grid;
      setGhost({ blockId: selectedBlock.id, x: snappedX, y: snappedY, size: selectedBlock.size, alpha: 0.55 });
      if (placingRef.current) {
        placeFromEvent(e);
      }
    };
    const onLeave = () => {
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
  }, [selectedBlock, computeWorldFromClient, snapSize, isDev, placeFromEvent]);

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
        onSend={(text) => socketRef.current?.emit('chat', text)}
        onFind={handleOpenFind}
        myId={myIdRef.current}
        playerCount={players.length}
      />
      <Joystick onDirection={handleDPad} />
    </div>
  );
}
