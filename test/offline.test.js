// Offline test harness: exercises the deterministic logic with synthetic data
// (the Polymarket hosts aren't reachable from this sandbox). Run: node test/offline.test.js
import assert from 'node:assert';
import { currentWindow } from '../src/marketDiscovery.js';
import { fmtUsd, fmtProb, fmtDelta, fmtEtTime } from '../src/render.js';
import { PriceFeed } from '../src/priceFeed.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('Window math');
check('floors to 5-min boundary & builds slug', () => {
  // 2026-06-17T09:37:25Z  -> window start 09:35:00Z
  const ms = Date.UTC(2026, 5, 17, 9, 37, 25);
  const w = currentWindow(ms);
  const expectedStart = Math.floor(Date.UTC(2026, 5, 17, 9, 35, 0) / 1000);
  assert.equal(w.startSec, expectedStart);
  assert.equal(w.endSec, expectedStart + 300);
  assert.equal(w.startSec % 300, 0);
  assert.equal(w.slug, `btc-updown-5m-${expectedStart}`);
});
check('exact boundary belongs to the new window', () => {
  const ms = Date.UTC(2026, 5, 17, 9, 40, 0); // exactly on a boundary
  const w = currentWindow(ms);
  assert.equal(w.startSec, Math.floor(ms / 1000));
});

console.log('Formatters');
check('USD formatting + null safety', () => {
  assert.equal(fmtUsd(68108.89), '$68,108.89');
  assert.equal(fmtUsd(null), '—');
  assert.equal(fmtUsd(NaN), '—');
});
check('probability + N/A for missing ask', () => {
  assert.equal(fmtProb(0.93), '0.93');
  assert.equal(fmtProb(null), 'N/A'); // matches reference "Up: N/A"
});
check('delta sign/percent', () => {
  const up = fmtDelta(68121.22, 68108.89);
  assert.match(up.text, /\+\$12\.33/);
  assert.match(up.text, /\+0\.02%/);
  const flat = fmtDelta(100, null);
  assert.equal(flat.text, '');
});
check('ET time renders', () => {
  const t = fmtEtTime(Math.floor(Date.UTC(2026, 5, 17, 13, 50, 0) / 1000));
  assert.match(t, /^\d{2}:\d{2}:\d{2}$/);
});

console.log('PriceFeed open-capture (Price-to-Beat)');
check('first tick in a window becomes its open price', () => {
  const feed = new PriceFeed();
  const winStart = Math.floor(Date.UTC(2026, 5, 17, 9, 35, 0) / 1000);
  // Simulate three Chainlink ticks within the same window.
  feed._handleEvent({
    topic: 'crypto_prices_chainlink',
    payload: { symbol: 'btc/usd', value: 105432.1, timestamp: (winStart + 0) * 1000 },
  });
  feed._handleEvent({
    topic: 'crypto_prices_chainlink',
    payload: { symbol: 'btc/usd', value: 105440.5, timestamp: (winStart + 2) * 1000 },
  });
  const open = feed.getOpen(winStart);
  assert.ok(open);
  assert.equal(open.source, 'chainlink');
  assert.equal(open.price, 105432.1); // the FIRST tick, not later ones
  // Live price reflects the latest tick.
  assert.equal(feed.getLive().price, 105440.5);
  assert.equal(feed.getLive().source, 'chainlink');
});
check('binance used as live fallback when no chainlink', () => {
  const feed = new PriceFeed();
  feed._handleEvent({
    topic: 'crypto_prices',
    payload: { symbol: 'btcusdt', value: 105500, timestamp: Date.now() },
  });
  const live = feed.getLive();
  assert.equal(live.source, 'binance');
  assert.equal(live.price, 105500);
});
check('old window buckets get pruned', () => {
  const feed = new PriceFeed();
  for (let i = 0; i < 12; i++) {
    const ts = (1_000_000_000 + i * 300) * 1000;
    feed._handleEvent({
      topic: 'crypto_prices_chainlink',
      payload: { symbol: 'btc/usd', value: 100 + i, timestamp: ts },
    });
  }
  assert.ok(feed.openChainlink.size <= 8, `map should be pruned, got ${feed.openChainlink.size}`);
});

console.log(`\nAll ${passed} checks passed.`);
