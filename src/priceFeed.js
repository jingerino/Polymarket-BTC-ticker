import WebSocket from 'ws';
import { CONFIG } from './config.js';

// the streaming price feed from Polymarket's RTDS WebSocket. We subscribe to both

//   * crypto_prices_chainlink (btc/usd) where we use it for both the Live Price and the Price-to-Beat so the two are
//     always apples-to-apples.
//   * crypto_prices (btcusdt, Binance) where it is updating even if the Chainlink feed goes quiet.
//
// Price-to-Beat capture: the first tick we receive inside a given 5 minute
// window is, by definition, at/after that window's boundary which is exactly
// the opening price the market is scored against. So we simply record the first
// chainlink price seen per window bucket. No special-casing, and it self-heals
// across window rollovers.

export class PriceFeed {
  constructor() {
    this.ws = null;
    this.pingTimer = null;
    this.reconnectDelay = CONFIG.wsReconnectBaseMs;
    this.closedByUser = false;
    this.connected = false;

    // Latest ticks per source: { value, atMs }.
    this.chainlink = null;
    this.binance = null;

    // windowStartSec -> opening price, one entry per source.
    this.openChainlink = new Map();
    this.openBinance = new Map();
  }

  start() {
    this._connect();
  }

  stop() {
    this.closedByUser = true;
    clearInterval(this.pingTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  // Preferred live price: Chainlink if we have it, else Binance. Includes the
  // source and how stale the reading is so the UI can flag it.
  getLive() {
    const pick = this.chainlink || this.binance;
    if (!pick) return null;
    const source = this.chainlink ? 'chainlink' : 'binance';
    return {
      price: pick.value,
      source,
      ageMs: Date.now() - pick.atMs,
      stale: Date.now() - pick.atMs > CONFIG.staleAfterMs,
    };
  }

  // Opening price (Price-to-Beat) for a specific window, Chainlink first.
  getOpen(windowStartSec) {
    if (this.openChainlink.has(windowStartSec)) {
      return { price: this.openChainlink.get(windowStartSec), source: 'chainlink' };
    }
    if (this.openBinance.has(windowStartSec)) {
      return { price: this.openBinance.get(windowStartSec), source: 'binance' };
    }
    return null;
  }

  _connect() {
    this.ws = new WebSocket(CONFIG.endpoints.rtdsWebSocket);

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectDelay = CONFIG.wsReconnectBaseMs;

      // Chainlink BTC/USD (resolution source) + Binance BTC/USDT (fallback).
      this._send({
        action: 'subscribe',
        subscriptions: [
          {
            topic: 'crypto_prices_chainlink',
            type: '*',
            filters: JSON.stringify({ symbol: CONFIG.asset.chainlinkSymbol }),
          },
          {
            topic: 'crypto_prices',
            type: 'update',
            filters: CONFIG.asset.binanceSymbol,
          },
        ],
      });

      // RTDS drops the connection without a PING at least every 5s.
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this._ping(), CONFIG.wsPingMs);
    });

    this.ws.on('message', (raw) => this._onMessage(raw));

    this.ws.on('close', () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      if (!this.closedByUser) this._scheduleReconnect();
    });

    // 'error' is followed by 'close'; swallow here so it doesn't crash the
    // process, and let the close handler drive the reconnect.
    this.ws.on('error', () => {});
  }

  _scheduleReconnect() {
    setTimeout(() => this._connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      CONFIG.wsReconnectMaxMs
    );
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  _ping() {
    // The server expects a literal "PING" text frame.
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send('PING');
    }
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // ignore non-JSON frames (e.g. "PONG")
    }

    // The socket may deliver a single object or an array of them.
    const events = Array.isArray(msg) ? msg : [msg];
    for (const ev of events) this._handleEvent(ev);
  }

  _handleEvent(ev) {
    if (!ev || !ev.payload) return;
    const value = toNum(ev.payload.value);
    if (value === null) return;

    // Prefer the price's own measurement timestamp; fall back to message time.
    const atMs = toNum(ev.payload.timestamp) ?? toNum(ev.timestamp) ?? Date.now();

    if (ev.topic === 'crypto_prices_chainlink') {
      this.chainlink = { value, atMs };
      this._recordOpen(this.openChainlink, atMs, value);
    } else if (ev.topic === 'crypto_prices') {
      this.binance = { value, atMs };
      this._recordOpen(this.openBinance, atMs, value);
    }
  }

  // First price seen in a window bucket is that window's open. We also prune old
  // buckets so the maps don't grow unbounded over a long run.
  _recordOpen(map, atMs, value) {
    const bucket = Math.floor(atMs / 1000 / CONFIG.windowSeconds) * CONFIG.windowSeconds;
    if (!map.has(bucket)) map.set(bucket, value);

    if (map.size > 8) {
      const cutoff = bucket - CONFIG.windowSeconds * 4;
      for (const key of map.keys()) {
        if (key < cutoff) map.delete(key);
      }
    }
  }
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
