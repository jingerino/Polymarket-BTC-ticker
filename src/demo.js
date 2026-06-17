import { currentWindow } from './marketDiscovery.js';
import { buildFrame } from './view.js';

// offline preview (`npm run demo`). Drives the real renderer + view with
// synthetic-but-realistic data so you can see the populated panel without any
// network access. Mirrors the numbers from the challenge's sample output.
export async function runDemo(renderer) {
  const w = currentWindow();
  const ptb = 68108.89;
  let live = 68108.9;

  const seq = [
    { up: 0.93, down: 0.08 },
    { up: 0.89, down: 0.12 },
    { up: 0.95, down: 0.06 },
    { up: 0.96, down: 0.05 },
    { up: 0.97, down: 0.04 },
    { up: 0.98, down: 0.03 },
    { up: null, down: 0.01 }, // demonstrates the "N/A" case
    { up: 0.99, down: 0.02 },
  ];

  let i = 0;
  const startSec = Math.floor(Date.now() / 1000);

  console.log('\n  DEMO MODE — synthetic data, no network. Ctrl-C to exit.\n');

  const iv = setInterval(() => {
    // Wander the live price around the price-to-beat.
    live += (Math.random() - 0.45) * 6;
    const book = seq[i % seq.length];
    i++;

    const elapsed = i; // 1s per tick
    renderer.draw(
      buildFrame({
        window: w,
        market: { title: 'Bitcoin Up or Down - 5 Minutes (DEMO)' },
        books: {
          up: book.up === null ? { ask: null } : { ask: book.up },
          down: { ask: book.down },
        },
        ptb: { value: ptb, source: 'chainlink' },
        live: { price: live, source: 'chainlink', stale: false },
        connected: true,
        status: 'demo',
        lastUpdateMs: Date.now(),
        // Fake the clock so the countdown visibly ticks down from ~30s.
        nowMs: (w.endSec - 30 + elapsed) * 1000,
      })
    );
  }, 1000);

  await new Promise((resolve) => {
    process.on('SIGINT', () => {
      clearInterval(iv);
      renderer.cleanup();
      resolve();
      process.exit(0);
    });
  });
}
