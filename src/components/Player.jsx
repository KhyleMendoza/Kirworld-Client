export default function Player({ name, x, y, isYou }) {
  return (
    <div
      className={`player ${isYou ? 'player--you' : ''}`}
      style={{
        transform: `translate(${x}px, ${y}px)`,
      }}
    >
      <div className="player-sprite" />
      <span className="player-name">{name}{isYou ? ' (you)' : ''}</span>
    </div>
  );
}
