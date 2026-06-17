import { CONFIG } from './config.js';
import { getJson } from './http.js';

// reading the UP and DOWN order books for a given market. 

export async function fetchBestAsk(tokenId) {
  const book = await getJson(CONFIG.endpoints.clobOrderBook(tokenId));
  return {
    ask: bestAsk(book?.asks),
    bid: bestBid(book?.bids),
    lastTrade: toNum(book?.last_trade_price),
  };
}

// Fetch both sides together; if one side errors we still return the other so a
// single bad response never blanks the whole row.
export async function fetchUpDown(upTokenId, downTokenId) {
  const [up, down] = await Promise.allSettled([
    fetchBestAsk(upTokenId),
    fetchBestAsk(downTokenId),
  ]);
  return {
    up: up.status === 'fulfilled' ? up.value : null,
    down: down.status === 'fulfilled' ? down.value : null,
  };
}

// scan rather than trusting array order — the documented sort can change and we
// only care about the extreme. Lowest ask = best price to buy.
function bestAsk(asks) {
  if (!Array.isArray(asks)) return null;
  let best = null;
  for (const level of asks) {
    const p = toNum(level?.price);
    if (p !== null && (best === null || p < best)) best = p;
  }
  return best;
}

// highest bid = best price to sell.
function bestBid(bids) {
  if (!Array.isArray(bids)) return null;
  let best = null;
  for (const level of bids) {
    const p = toNum(level?.price);
    if (p !== null && (best === null || p > best)) best = p;
  }
  return best;
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
