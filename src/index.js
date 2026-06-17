import { CONFIG } from './config.js';
import { currentWindow, fetchMarket, MarketNotReadyError } from './marketDiscovery.js';
import { fetchUpDown } from './orderbook.js';
import { fetchPriceToBeat } from './priceToBeat.js';
import { PriceFeed } from './priceFeed.js';
import { Renderer } from './render.js';
import { buildFrame } from './view.js';
import { runDemo } from './demo.js';

// Shared, mutable view of the world. The WebSocket feed updates the live price
// continuously in the background; the 1s loop refreshes order books + redraws.
// Keeping last-known values in state (rather than blanking on every error) is
// what lets a transient bad API response pass by invisibly.

const state = {
  window: currentWindow(),
  market: null, // { upTokenId, downTokenId, title, ... }
  books: { up: null, down: null }, // last good order-book reads
  ptbHttp: null, // price-to-beat from the HTTP fallback
  status: 'starting…',
  lastUpdateMs: null,
};

const feed = new PriceFeed();
const renderer = new Renderer();
let timer = null;

// discover the market for a slug, retrying transparently while it's still being
// indexed (the first moment of a new window). Also kicks off the HTTP
// price-to-beat fetch as a fallback for mid-window joins.
async function loadMarket(window) {
  try {
    state.market = await fetchMarket(window.slug);
    state.status = 'live';
  } catch (err) {
    state.market = null;
    state.status =
      err instanceof MarketNotReadyError
        ? 'discovering market…'
        : `discovery error: ${short(err)}`;
  }
  // fire-and-forget: only used if we never capture the open from the stream.
  fetchPriceToBeat(window.slug).then((v) => {
    if (v !== null) state.ptbHttp = v;
  });
}

// resolve the Price-to-Beat with a clear priority order:
//   1. Chainlink open captured live (authoritative — what the market scores on)
//   2. Binance open captured live (fallback if Chainlink was quiet)
//   3. HTTP price-to-beat endpoint (covers mid-window joins)
function resolvePtb(window) {
  const open = feed.getOpen(window.startSec);
  if (open) return { value: open.price, source: open.source };
  if (state.ptbHttp !== null) return { value: state.ptbHttp, source: 'api' };
  return { value: null, source: null };
}

// One refresh: roll the window if needed, refresh books, redraw. Self-scheduling
// (setTimeout, not setInterval) so a slow network tick can never stack up.
async function tick() {
  const now = currentWindow();

  // Window rollover: a new 5-minute market just opened.
  if (now.slug !== state.window.slug) {
    state.window = now;
    state.ptbHttp = null;
    state.books = { up: null, down: null };
    await loadMarket(now);
  }

  // Ensure we have the market (first run, or earlier discovery failed).
  if (!state.market) await loadMarket(state.window);

  // Refresh order books. On error, keep previous values and note it.
  if (state.market) {
    try {
      const next = await fetchUpDown(state.market.upTokenId, state.market.downTokenId);
      if (next.up) state.books.up = next.up;
      if (next.down) state.books.down = next.down;
      state.status = 'live';
      state.lastUpdateMs = Date.now();
    } catch (err) {
      state.status = `orderbook error: ${short(err)}`;
    }
  }

  render();
  timer = setTimeout(tick, CONFIG.refreshMs);
}

function render() {
  renderer.draw(
    buildFrame({
      window: state.window,
      market: state.market,
      books: state.books,
      ptb: resolvePtb(state.window),
      live: feed.getLive(),
      connected: feed.connected,
      status: state.status,
      lastUpdateMs: state.lastUpdateMs,
      nowMs: Date.now(),
    })
  );
}

function short(err) {
  return (err && err.message ? err.message : String(err)).slice(0, 60);
}

// Lifecycle
function shutdown() {
  clearTimeout(timer);
  feed.stop();
  renderer.cleanup();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  // Offline preview of the populated UI — no network required.
  if (process.argv.includes('--demo')) {
    await runDemo(renderer);
    return;
  }

  feed.start();
  await loadMarket(state.window);
  render(); // draw immediately so the user isn't staring at a blank terminal
  timer = setTimeout(tick, CONFIG.refreshMs);
}

main().catch((err) => {
  renderer.cleanup();
  console.error('Fatal:', err);
  process.exit(1);
});
