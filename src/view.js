import { CONFIG } from './config.js';
import {
  COLOR,
  fmtUsd,
  fmtProb,
  fmtDelta,
  fmtEtTime,
  fmtLocalTime,
} from './render.js';

// pure function: given a snapshot of state, return the array of lines for one
// frame. 

export function buildFrame(s) {
  const w = s.window;
  const nowSec = Math.floor((s.nowMs ?? Date.now()) / 1000);
  const expiresIn = Math.max(0, w.endSec - nowSec);

  const livePrice = s.live ? s.live.price : null;
  const delta = fmtDelta(livePrice, s.ptb.value);

  const upAsk = s.books.up ? s.books.up.ask : null;
  const downAsk = s.books.down ? s.books.down.ask : null;

  const dot = s.connected ? `${COLOR.green}●${COLOR.reset}` : `${COLOR.red}●${COLOR.reset}`;
  const sourceTag = s.live ? `${s.live.source}${s.live.stale ? ' ·stale' : ''}` : 'connecting';
  const title = s.market?.title || CONFIG.asset.label;

  return [
    `${COLOR.bold}${COLOR.cyan} Polymarket · ${CONFIG.asset.label}${COLOR.reset}   ${dot} ${COLOR.dim}${sourceTag}${COLOR.reset}`,
    ` ${COLOR.dim}${truncate(title, 58)}${COLOR.reset}`,
    ` ${COLOR.gray}window ${fmtEtTime(w.startSec)}–${fmtEtTime(w.endSec)} ET · ${w.slug}${COLOR.reset}`,
    '',
    ` ${label('Price to Beat')}${COLOR.bold}${fmtUsd(s.ptb.value)}${COLOR.reset}${ptbNote(s.ptb)}`,
    ` ${label('Live Price')}${COLOR.bold}${fmtUsd(livePrice)}${COLOR.reset}  ${delta.color}${delta.text}${COLOR.reset}`,
    ` ${label('Up')}${askColor(upAsk)}${fmtProb(upAsk)}${COLOR.reset}`,
    ` ${label('Down')}${askColor(downAsk)}${fmtProb(downAsk)}${COLOR.reset}`,
    ` ${label('Expires in')}${expiryColor(expiresIn)}${expiresIn}s${COLOR.reset}`,
    '',
    ` ${COLOR.gray}${statusLine(s)}${COLOR.reset}`,
  ];
}

function statusLine(s) {
  const updated = s.lastUpdateMs
    ? `updated ${fmtLocalTime(new Date(s.lastUpdateMs))}`
    : 'waiting…';
  return `${s.status} · ${updated} · ctrl-c to quit`;
}

function ptbNote(ptb) {
  if (ptb.value === null) return `${COLOR.gray}  (awaiting window open)${COLOR.reset}`;
  if (ptb.source && ptb.source !== 'chainlink') return `${COLOR.gray}  (${ptb.source})${COLOR.reset}`;
  return '';
}

function label(text) {
  return `${COLOR.gray}${text.padEnd(15)}${COLOR.reset}`;
}

function askColor(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return COLOR.gray;
  return v >= 0.5 ? COLOR.green : COLOR.red;
}

function expiryColor(sec) {
  return sec <= 10 ? COLOR.red : sec <= 30 ? COLOR.yellow : COLOR.reset;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
