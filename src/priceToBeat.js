import { CONFIG } from './config.js';
import { getJsonOrText } from './http.js';

// mid window fallback
//
// our primary source is the Chainlink open price captured live from the RTDS
// stream (see priceFeed.js) — that's the exact value Polymarket resolves
// against. But if we *join mid-window* we've already missed that opening tick,
// so we ask Polymarket's price-to-beat endpoint instead. It's documented for
// equity markets; the response shape isn't guaranteed, so we defensively dig a
// number out of whatever comes back. Returns null on any failure (the caller
// just shows "—" until the next clean window boundary).

export async function fetchPriceToBeat(slug) {
  try {
    const body = await getJsonOrText(CONFIG.endpoints.priceToBeat(slug));
    return extractNumber(body);
  } catch {
    return null;
  }
}

function extractNumber(body) {
  if (typeof body === 'number') return Number.isFinite(body) ? body : null;

  if (typeof body === 'string') {
    const n = parseFloat(body.trim());
    return Number.isFinite(n) ? n : null;
  }

  if (body && typeof body === 'object') {
    const candidate =
      body.priceToBeat ??
      body.price_to_beat ??
      body.price ??
      body.value ??
      body.ptb;
    const n = typeof candidate === 'string' ? parseFloat(candidate) : candidate;
    return Number.isFinite(n) ? n : null;
  }

  return null;
}
