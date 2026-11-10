import { useState } from 'react';
import OnScreenKeyboard from './OnScreenKeyboard.jsx';

/** Text input with a ⌨️ button that opens the hand-friendly on-screen keyboard. */
export default function NameField({ value, onChange, placeholder, max = 16, caps = 'title', label, autoFocus = false }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="namefield">
      <div className="namefield-row">
        <input
          className="text-input"
          value={value}
          maxLength={max}
          placeholder={placeholder}
          aria-label={label || placeholder}
          autoFocus={autoFocus}
          autoCapitalize={caps === 'upper' ? 'characters' : 'words'}
          spellCheck={false}
          onChange={(e) => onChange(caps === 'upper' ? e.target.value.toUpperCase() : e.target.value)}
        />
        <button type="button" className={`osk-toggle ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Toggle on-screen keyboard">
          ⌨️
        </button>
      </div>
      {open && <OnScreenKeyboard value={value} onChange={onChange} onDone={() => setOpen(false)} max={max} caps={caps} />}
    </div>
  );
}
