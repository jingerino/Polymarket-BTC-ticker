// one place for everything tha could change
//for example if polymarket renames an endpoint, then we can change it here and not have to search through the codebase for it.

export const CONFIG = {
  asset: {
    // The 5-minute markets use a deterministic slug: `btc-updown-5m-<windowStart>`
    // where windowStart is the Unix timestamp (seconds) of the window's start,
    // always divisible by WINDOW_SECONDS.
    slugPrefix: 'btc-updown-5m',
    label: 'BTC Up or Down (5-minute)',
    // chainlink symbol Polymarket resolves these markets against, and the
    // Binance symbol we use as a display fallback.
    chainlinkSymbol: 'btc/usd',
    binanceSymbol: 'btcusdt',
  },

  // a new market opens every 5 minutes (5*60), aligned to the clock.
  windowSeconds: 300,

  // how often we redraw the terminal and refresh the order books (every second)
  refreshMs: 1000,

  endpoints: {
    // Gamma: market metadata (token IDs, outcomes, end time) by slug.
    gammaEventBySlug: (slug) =>
      `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`,

    // CLOB: live order book per outcome token. Best ask = price to buy that side.
    clobOrderBook: (tokenId) =>
      `https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`,

    // Real-Time Data Socket: streams the Chainlink (and Binance) BTC price.
    rtdsWebSocket: 'wss://ws-live-data.polymarket.com',

    // HTTP fallback for the price-to-beat when we join mid-window and haven't
    // captured the window's opening Chainlink tick from the stream.
    priceToBeat: (slug) =>
      `https://polymarket.com/api/equity/price-to-beat/${encodeURIComponent(slug)}`,
  },

  // Network timeouts / resilience.
  httpTimeoutMs: 4000,
  wsPingMs: 5000, // RTDS requires a PING at least every 5s.
  wsReconnectBaseMs: 1000,
  wsReconnectMaxMs: 15000,

  // A live price older than this is shown as [stale].
  staleAfterMs: 15000,
};
