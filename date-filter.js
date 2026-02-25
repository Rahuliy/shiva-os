/**
 * date-filter.js — Shared date filter bar component for Artha financial views
 *
 * Renders a sticky preset filter bar (1W, 1M, YTD, 3M, 1Y, Custom) and
 * persists the selected preset in localStorage('artha-date-filter').
 *
 * Does NOT import artha-utils.js directly — the caller passes getDateRange
 * as part of the onChange callback pattern so this module stays decoupled.
 *
 * Usage:
 *   import { initDateFilter } from './date-filter.js';
 *   initDateFilter('date-filter-mount', (preset, customRange) => { ... });
 */

const STORAGE_KEY   = 'artha-date-filter';
const DEFAULT_PRESET = '1Y';
const PRESETS        = ['1W', '1M', 'YTD', '3M', '1Y'];

/** Inject filter bar CSS once into <head>. Idempotent. */
function injectStyles() {
  if (document.getElementById('date-filter-styles')) return;
  const style = document.createElement('style');
  style.id = 'date-filter-styles';
  style.textContent = `
/* ─── DATE FILTER BAR ────────────────────────────────────────────────── */
.date-filter-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 36px;
  background: var(--topbar-bg, rgba(14,8,5,0.85));
  border-bottom: 1px solid var(--border-0, #261a07);
  position: sticky;
  top: 50px;
  z-index: 190;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  animation: fromTop 0.35s cubic-bezier(0.16,1,0.3,1) 0.1s both;
}

.date-filter-btn {
  font-family: var(--mono, 'IBM Plex Mono', monospace);
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--text-3, #4a3418);
  background: none;
  border: 1px solid transparent;
  border-radius: 1px;
  padding: 3px 10px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  text-transform: uppercase;
  line-height: 1.4;
}

.date-filter-btn:hover {
  color: var(--text-2, #7a5a2c);
  border-color: var(--border-1, #36250d);
}

.date-filter-btn.active {
  color: var(--gold, #d4a030);
  border-color: var(--gold-dim, #6a5018);
  background: var(--gold-bg, rgba(212,160,48,0.08));
}

.date-filter-custom-inputs {
  display: none;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

.date-filter-custom-inputs.visible {
  display: flex;
}

.date-filter-sep {
  font-family: var(--mono, 'IBM Plex Mono', monospace);
  font-size: 11px;
  color: var(--text-3, #4a3418);
  letter-spacing: 0.08em;
}

.date-filter-input {
  font-family: var(--mono, 'IBM Plex Mono', monospace);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--text-1, #c09450);
  background: var(--bg-2, #181106);
  border: 1px solid var(--border-1, #36250d);
  border-radius: 1px;
  padding: 3px 8px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s, color 0.15s;
  color-scheme: dark;
}

.date-filter-input:focus {
  border-color: var(--gold-dim, #6a5018);
  color: var(--text-0, #eedfc0);
}

html.light .date-filter-input {
  background: var(--bg-2, #e4d09c);
  color: var(--text-1, #3e280a);
  color-scheme: light;
}
`;
  document.head.appendChild(style);
}

/**
 * Initialize the date filter bar component.
 *
 * @param {string}   targetId  - ID of the container element to render into
 * @param {Function} onChange  - Callback fired on preset change:
 *                               onChange(preset: string, customRange?: {start: Date, end: Date})
 *                               preset is one of '1W','1M','YTD','3M','1Y','custom'
 */
export function initDateFilter(targetId, onChange) {
  const container = document.getElementById(targetId);
  if (!container) return;

  injectStyles();

  // Restore saved preset or use default
  const saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_PRESET;

  // ── Build bar HTML ──────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.className = 'date-filter-bar';
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', 'Date range filter');

  // Preset buttons
  const btnEls = {};
  PRESETS.forEach(preset => {
    const btn = document.createElement('button');
    btn.className = 'date-filter-btn' + (preset === saved ? ' active' : '');
    btn.textContent = preset;
    btn.setAttribute('data-preset', preset);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', preset === saved ? 'true' : 'false');
    btnEls[preset] = btn;
    bar.appendChild(btn);
  });

  // Custom button
  const customBtn = document.createElement('button');
  customBtn.className = 'date-filter-btn' + (saved === 'custom' ? ' active' : '');
  customBtn.textContent = 'Custom';
  customBtn.setAttribute('data-preset', 'custom');
  customBtn.setAttribute('role', 'tab');
  customBtn.setAttribute('aria-selected', saved === 'custom' ? 'true' : 'false');
  bar.appendChild(customBtn);

  // Custom date inputs (hidden until Custom is selected)
  const customInputs = document.createElement('div');
  customInputs.className = 'date-filter-custom-inputs' + (saved === 'custom' ? ' visible' : '');

  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.className = 'date-filter-input';
  startInput.setAttribute('aria-label', 'Custom range start date');

  const sep = document.createElement('span');
  sep.className = 'date-filter-sep';
  sep.textContent = '→';

  const endInput = document.createElement('input');
  endInput.type = 'date';
  endInput.className = 'date-filter-input';
  endInput.setAttribute('aria-label', 'Custom range end date');

  customInputs.appendChild(startInput);
  customInputs.appendChild(sep);
  customInputs.appendChild(endInput);
  bar.appendChild(customInputs);

  container.appendChild(bar);

  // ── Active state helper ─────────────────────────────────────────────
  function setActive(preset) {
    // Deactivate all presets
    PRESETS.forEach(p => {
      const b = btnEls[p];
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    customBtn.classList.remove('active');
    customBtn.setAttribute('aria-selected', 'false');

    // Activate selected
    if (preset === 'custom') {
      customBtn.classList.add('active');
      customBtn.setAttribute('aria-selected', 'true');
      customInputs.classList.add('visible');
    } else {
      const b = btnEls[preset];
      if (b) {
        b.classList.add('active');
        b.setAttribute('aria-selected', 'true');
      }
      customInputs.classList.remove('visible');
    }
  }

  // ── Preset button click handlers ────────────────────────────────────
  PRESETS.forEach(preset => {
    btnEls[preset].addEventListener('click', () => {
      setActive(preset);
      localStorage.setItem(STORAGE_KEY, preset);
      onChange(preset);
    });
  });

  // ── Custom button click handler ─────────────────────────────────────
  customBtn.addEventListener('click', () => {
    setActive('custom');
    localStorage.setItem(STORAGE_KEY, 'custom');
    // Only fire onChange if both dates are already set
    if (startInput.value && endInput.value) {
      const start = new Date(startInput.value + 'T00:00:00');
      const end   = new Date(endInput.value   + 'T00:00:00');
      onChange('custom', { start, end });
    }
  });

  // ── Custom date input change handlers ───────────────────────────────
  function tryFireCustomRange() {
    if (startInput.value && endInput.value) {
      const start = new Date(startInput.value + 'T00:00:00');
      const end   = new Date(endInput.value   + 'T00:00:00');
      // Ensure start <= end
      if (start <= end) {
        onChange('custom', { start, end });
      }
    }
  }
  startInput.addEventListener('change', tryFireCustomRange);
  endInput.addEventListener('change',   tryFireCustomRange);

  // ── Fire initial onChange with saved/default preset ─────────────────
  // If saved preset is 'custom' but no dates are set, fall back to DEFAULT
  if (saved === 'custom' && (!startInput.value || !endInput.value)) {
    setActive(DEFAULT_PRESET);
    localStorage.setItem(STORAGE_KEY, DEFAULT_PRESET);
    onChange(DEFAULT_PRESET);
  } else {
    setActive(saved);
    onChange(saved);
  }
}
