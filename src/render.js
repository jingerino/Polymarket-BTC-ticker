
// for a panel that updates every second, we want to "redraw" the same area of the terminal
// ANSI escapes: on each frame we move the cursor back up over the previous
// frame and clear+rewrite each line. Scrollback above the panel is preserved
// (no full-screen wipe), so it doesn't fight with the user's terminal history.
//
// If stdout isn't a TTY, we fall back to printing one line per tick so the output still makes sense.

const ESC = '\x1b[';
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const CLEAR_LINE = `${ESC}2K`;

const COLOR = {
  reset: `${ESC}0m`,
  dim: `${ESC}2m`,
  bold: `${ESC}1m`,
  green: `${ESC}32m`,
  red: `${ESC}31m`,
  yellow: `${ESC}33m`,
  cyan: `${ESC}36m`,
  gray: `${ESC}90m`,
};

export class Renderer {
  constructor(stream = process.stdout) {
    this.stream = stream;
    this.isTTY = Boolean(stream.isTTY);
    this.prevLineCount = 0;
    this.started = false;
  }

  // `lines` is an array of strings = one full frame.
  draw(lines) {
    if (!this.isTTY) {
      // Non-interactive: collapse the panel to a single status line per tick.
      this.stream.write(lines.filter(Boolean).join('  ').replace(/\s+/g, ' ') + '\n');
      return;
    }

    if (!this.started) {
      this.stream.write(HIDE_CURSOR);
      this.started = true;
    } else {
      // Move cursor up to the top of the previously drawn frame.
      this.stream.write(`${ESC}${this.prevLineCount}A`);
    }

    const frame = lines.map((line) => `${CLEAR_LINE}${line}`).join('\n') + '\n';
    this.stream.write(frame);
    this.prevLineCount = lines.length;
  }

  cleanup() {
    if (this.isTTY && this.started) {
      this.stream.write(SHOW_CURSOR + '\n');
    }
  }
}

export { COLOR };

// ---- formatting helpers (pure functions, easy to eyeball/test) ----

export function fmtUsd(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return (
    '$' +
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function fmtProb(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return value.toFixed(2);
}

export function fmtDelta(live, ptb) {
  if (
    live === null ||
    ptb === null ||
    live === undefined ||
    ptb === undefined ||
    !Number.isFinite(live) ||
    !Number.isFinite(ptb)
  ) {
    return { text: '', color: COLOR.gray };
  }
  const diff = live - ptb;
  const pct = ptb !== 0 ? (diff / ptb) * 100 : 0;
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '■';
  const sign = diff >= 0 ? '+' : '-';
  const color = diff > 0 ? COLOR.green : diff < 0 ? COLOR.red : COLOR.gray;
  const text =
    `${arrow} ${sign}$${Math.abs(diff).toFixed(2)} ` +
    `(${sign}${Math.abs(pct).toFixed(2)}%)`;
  return { text, color };
}

// HH:MM:SS in US Eastern, since the markets are titled in ET.
export function fmtEtTime(unixSec) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(unixSec * 1000));
}

// Local wall-clock time with offset, e.g. "12:19:44".
export function fmtLocalTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
