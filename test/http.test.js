// Tests the HTTP-facing modules by stubbing global.fetch with realistic
// Polymarket response shapes (captured from the live Gamma/CLOB docs & API).
import assert from 'node:assert';
import { fetchMarket, MarketNotReadyError } from '../src/marketDiscovery.js';
import { fetchBestAsk } from '../src/orderbook.js';

let passed = 0;
function check(name, promiseFactory) {
  return promiseFactory().then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  });
}

function stubFetch(handler) {
  global.fetch = async (url) => {
    const body = handler(String(url));
    return {
      ok: body.ok !== false,
      status: body.status || 200,
      json: async () => body.json,
      text: async () => (typeof body.json === 'string' ? body.json : JSON.stringify(body.json)),
    };
  };
}

const SLUG = 'btc-updown-5m-1750152900';

// A minimal but realistically-shaped Gamma event for the BTC up/down market.
function gammaEvent(slug) {
  return {
    slug,
    title: 'Bitcoin Up or Down - June 17, 9:35AM-9:40AM ET',
    endDate: '2026-06-17T13:40:00Z',
    markets: [
      {
        question: 'Bitcoin Up or Down ...',
        conditionId: '0xabc',
        outcomes: '["Up", "Down"]',
        clobTokenIds: '["1111111111", "2222222222"]',
        acceptingOrders: true,
      },
    ],
  };
}

async function run() {
  console.log('Gamma discovery');

  await check('parses Up/Down token IDs by label', async () => {
    stubFetch(() => ({ json: [gammaEvent(SLUG)] }));
    const m = await fetchMarket(SLUG);
    assert.equal(m.upTokenId, '1111111111');
    assert.equal(m.downTokenId, '2222222222');
    assert.equal(m.slug, SLUG);
  });

  await check('reversed outcome order still maps correctly', async () => {
    stubFetch(() => {
      const ev = gammaEvent(SLUG);
      ev.markets[0].outcomes = '["Down", "Up"]';
      ev.markets[0].clobTokenIds = '["DDDD", "UUUU"]';
      return { json: [ev] };
    });
    const m = await fetchMarket(SLUG);
    assert.equal(m.upTokenId, 'UUUU');
    assert.equal(m.downTokenId, 'DDDD');
  });

  await check('GOTCHA: unfiltered list on slug miss → MarketNotReady', async () => {
    // Gamma returns OTHER events (not our slug) when the slug doesn't exist yet.
    stubFetch(() => ({ json: [gammaEvent('some-unrelated-market'), gammaEvent('another-one')] }));
    await assert.rejects(() => fetchMarket(SLUG), MarketNotReadyError);
  });

  await check('empty array → MarketNotReady', async () => {
    stubFetch(() => ({ json: [] }));
    await assert.rejects(() => fetchMarket(SLUG), MarketNotReadyError);
  });

  console.log('Order book');

  await check('best ask = lowest ask; best bid = highest bid', async () => {
    stubFetch(() => ({
      json: {
        asks: [{ price: '0.95', size: '100' }, { price: '0.93', size: '50' }],
        bids: [{ price: '0.90', size: '100' }, { price: '0.92', size: '20' }],
        last_trade_price: '0.94',
      },
    }));
    const r = await fetchBestAsk('1111');
    assert.equal(r.ask, 0.93); // lowest ask = price to buy
    assert.equal(r.bid, 0.92); // highest bid
    assert.equal(r.lastTrade, 0.94);
  });

  await check('no asks → null (renders as N/A)', async () => {
    stubFetch(() => ({ json: { asks: [], bids: [{ price: '0.01', size: '5' }] } }));
    const r = await fetchBestAsk('1111');
    assert.equal(r.ask, null);
  });

  console.log(`\nAll ${passed} checks passed.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
