const ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/**
 * Big on-screen keys so names can be typed with the hand cursor (fist or point-and-hold).
 * Calls onChange(next) with the edited name; letters auto-capitalise after a space.
 */
export default function OnScreenKeyboard({ value, onChange, onDone, max = 16, caps = 'title' }) {
  const add = (ch) => {
    if (value.length >= max) return;
    const cap = caps === 'upper' || value.length === 0 || value.endsWith(' ');
    onChange(value + (cap ? ch.toUpperCase() : ch.toLowerCase()));
  };

  return (
    <div className="osk" role="group" aria-label="On-screen keyboard">
      {ROWS.map((row) => (
        <div className="osk-row" key={row}>
          {[...row].map((ch) => (
            <button key={ch} type="button" className="osk-key" onClick={() => add(ch)}>
              {ch}
            </button>
          ))}
        </div>
      ))}
      <div className="osk-row">
        <button type="button" className="osk-key osk-wide" onClick={() => onChange(value.slice(0, -1))}>
          ⌫
        </button>
        <button type="button" className="osk-key osk-space" onClick={() => value && !value.endsWith(' ') && add(' ')}>
          space
        </button>
        <button type="button" className="osk-key osk-wide" onClick={() => onChange('')}>
          clear
        </button>
        <button type="button" className="osk-key osk-wide osk-done" onClick={onDone}>
          ✔ done
        </button>
      </div>
    </div>
  );
}
