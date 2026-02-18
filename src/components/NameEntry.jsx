import { useState } from 'react';
import '../styles/NameEntry.css';

export default function NameEntry({ onJoin }) {
  const [name, setName] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onJoin(trimmed);
  }

  return (
    <div className="name-entry">
      <div className="name-entry-card">
        <h1>KIRWORLD</h1>
        <p>Enter your in-game name</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            autoFocus
          />
          <button type="submit">Play</button>
        </form>
      </div>
    </div>
  );
}
