import { useState, useEffect } from 'react';
import '../styles/Inventory.css';

const SLOT_COUNT = 30;

export default function Inventory() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key?.toLowerCase();
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if (key === 'i') {
        setExpanded((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const slots = Array.from({ length: SLOT_COUNT });

  return (
    <div className={`inventory ${expanded ? 'inventory--expanded' : ''}`}>
      <div className="inventory-hotbar">
        {slots.slice(0, 5).map((_, idx) => (
          <div key={idx} className="inventory-slot inventory-slot--hotbar" />
        ))}
        <button
          type="button"
          className="inventory-toggle"
          onClick={() => setExpanded((open) => !open)}
          title={expanded ? 'Hide inventory (I)' : 'Show inventory (I)'}
        >
          {expanded ? '▾' : '▴'}
        </button>
      </div>
      <div className="inventory-panel">
        <div className="inventory-header">
          <span className="inventory-title">Inventory</span>
          <span className="inventory-count">{SLOT_COUNT} slots</span>
        </div>
        <div className="inventory-grid">
          {slots.map((_, idx) => (
            <div key={idx} className="inventory-slot" />
          ))}
        </div>
      </div>
    </div>
  );
}

