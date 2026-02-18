import { useState } from 'react';
import NameEntry from './components/NameEntry';
import GameArea from './components/GameArea';

export default function App() {
  const [playerName, setPlayerName] = useState(null);

  if (playerName === null) {
    return <NameEntry onJoin={setPlayerName} />;
  }
  return <GameArea playerName={playerName} />;
}
