import { useState, useEffect } from 'react';
import north from '../character/rotations/north.png';
import northEast from '../character/rotations/north-east.png';
import east from '../character/rotations/east.png';
import southEast from '../character/rotations/south-east.png';
import south from '../character/rotations/south.png';
import southWest from '../character/rotations/south-west.png';
import west from '../character/rotations/west.png';
import northWest from '../character/rotations/north-west.png';

const ROTATION_IMAGES = {
  north,
  'north-east': northEast,
  east,
  'south-east': southEast,
  south,
  'south-west': southWest,
  west,
  'north-west': northWest,
};

const WALK_FRAME_COUNT = 6;
const WALK_FRAME_MS = 90;
const IDLE_FRAME_COUNT = 4;
const IDLE_FRAME_MS = 150;

const walkModules = import.meta.glob('../character/walk/*/*.png', { eager: true, query: '?url', import: 'default' });
const idleModules = import.meta.glob('../character/breathing-idle/*/*.png', { eager: true, query: '?url', import: 'default' });

function getWalkSrc(direction, frameIndex) {
  const key = `../character/walk/${direction}/frame_${String(frameIndex).padStart(3, '0')}.png`;
  return walkModules[key] || null;
}

function getIdleSrc(direction, frameIndex) {
  const key = `../character/breathing-idle/${direction}/frame_${String(frameIndex).padStart(3, '0')}.png`;
  return idleModules[key] || null;
}

const DEFAULT_DIRECTION = 'south';

const BASE_SIZE = 48;

export default function Player({ name, x, y, zoom = 1, direction, isMoving, isIdle, isYou }) {
  const dir = direction || DEFAULT_DIRECTION;
  const [walkFrame, setWalkFrame] = useState(0);
  const [idleFrame, setIdleFrame] = useState(0);

  useEffect(() => {
    if (!isMoving) return;
    const id = setInterval(() => {
      setWalkFrame((f) => (f + 1) % WALK_FRAME_COUNT);
    }, WALK_FRAME_MS);
    return () => clearInterval(id);
  }, [isMoving]);

  useEffect(() => {
    if (!isIdle) return;
    const id = setInterval(() => {
      setIdleFrame((f) => (f + 1) % IDLE_FRAME_COUNT);
    }, IDLE_FRAME_MS);
    return () => clearInterval(id);
  }, [isIdle]);

  const src = isMoving
    ? (getWalkSrc(dir, walkFrame) || ROTATION_IMAGES[dir] || ROTATION_IMAGES[DEFAULT_DIRECTION])
    : isIdle
      ? (getIdleSrc(dir, idleFrame) || ROTATION_IMAGES[dir] || ROTATION_IMAGES[DEFAULT_DIRECTION])
      : (ROTATION_IMAGES[dir] || ROTATION_IMAGES[DEFAULT_DIRECTION]);

  const size = Math.round(BASE_SIZE * zoom) || BASE_SIZE;
  const px = Math.round(Number(x)) || 0;
  const py = Math.round(Number(y)) || 0;
  return (
    <div
      className="player"
      style={{
        transform: `translate(${px}px, ${py}px)`,
        width: size,
      }}
    >
      <span className="player-name">{name}</span>
      <img
        className="player-sprite"
        src={src}
        alt=""
        width={size}
        height={size}
        draggable={false}
      />
    </div>
  );
}
