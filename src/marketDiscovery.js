import { CONFIG } from './config.js';
import { getJson } from './http.js';

// which market is currently open, and what are its token IDs? (or null if not yet indexed)

export function currentWindow(nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);
  const start = nowSec - (nowSec % CONFIG.windowSeconds); // floor to 5-min boundary
  const end = start + CONFIG.windowSeconds;
  const slug = `${CONFIG.asset.slugPrefix}-${start}`;
  return { startSec: start, endSec: end, slug };
}

// when a slug doesn't exist yet, Gamma's `?slug=` query
// returns an *unfiltered* list of events rather than an empty array. If we
// trusted that blindly we'd start showing a completely unrelated market, so we
// strictly verify the returned event's slug matches what we asked for.
export async function fetchMarket(slug) {
  const events = await getJson(CONFIG.endpoints.gammaEventBySlug(slug));

  if (!Array.isArray(events) || events.length === 0) {
    throw new MarketNotReadyError(slug);
  }

  const event = events.find((e) => e?.slug === slug);
  if (!event) {
    // Slug not indexed yet, the window just opened. Caller should retry.
    throw new MarketNotReadyError(slug);
  }

  const market = pickUpDownMarket(event);
  if (!market) throw new MarketNotReadyError(slug);

  const outcomes = safeJsonArray(market.outcomes); // e.g. ["Up", "Down"]
  const tokenIds = safeJsonArray(market.clobTokenIds); // aligned with outcomes
  if (outcomes.length < 2 || tokenIds.length < 2) {
    throw new MarketNotReadyError(slug);
  }

  // Map by outcome label rather than assuming index order. Falls back to
  // [0]=Up, [1]=Down if labels are unexpected (e.g. "Yes"/"No").
  let upIdx = outcomes.findIndex((o) => /^up$/i.test(o));
  let downIdx = outcomes.findIndex((o) => /^down$/i.test(o));
  if (upIdx === -1 || downIdx === -1) {
    upIdx = 0;
    downIdx = 1;
  }

  return {
    slug,
    title: event.title || market.question || CONFIG.asset.label,
    conditionId: market.conditionId || null,
    upTokenId: tokenIds[upIdx],
    downTokenId: tokenIds[downIdx],
    endDateMs: event.endDate ? Date.parse(event.endDate) : null,
    acceptingOrders: market.acceptingOrders !== false,
  };
}

// An event can technically carry several markets; choose the BTC up/down one.
function pickUpDownMarket(event) {
  const markets = Array.isArray(event.markets) ? event.markets : [];
  if (markets.length === 0) return null;
  const updown = markets.find((m) => {
    const outs = safeJsonArray(m.outcomes).map((s) => String(s).toLowerCase());
    return outs.includes('up') && outs.includes('down');
  });
  return updown || markets[0];
}

// Gamma encodes arrays as JSON *strings*, e.g. "[\"Up\", \"Down\"]".
function safeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Distinct error type so the main loop can treat "not indexed yet" as a normal,
// transient state (show "discovering…") instead of a real failure.
export class MarketNotReadyError extends Error {
  constructor(slug) {
    super(`Market not ready for slug ${slug}`);
    this.name = 'MarketNotReadyError';
    this.slug = slug;
  }
}
