# Polymarket BTC (live terminal)

a backend script that taps Polymarket's public data and prints a live view of the Bitcoin Up or Down: the price to beat, the current BTC price, the Up/Down odds, and a countdown to the window closing. It rewrites the same block of text in place every second instead of scrolling endless new lines, so you get a clean running summary rather than a wall of output.

example of summary:

```
 Polymarket · BTC Up or Down (5-minute)   ● chainlink
 Bitcoin Up or Down - June 17, 9:35AM-9:40AM ET
 window 09:35:00–09:40:00 ET · btc-updown-5m-1750152900

 Price to Beat  $68,108.89
 Live Price     $68,121.22  ▲ +$12.33 (+0.02%)
 Up             0.96
 Down           0.05
 Expires in     23s

 live · updated 12:19:44 · ctrl-c to quit
```

The panel redraws in place once a second, while the live price keeps updating from a WebSocket in between redraws.

## Running it

You'll need Node 18 or newer (I rely on the built-in `fetch`). There's only one dependency, `ws`.

```bash
npm install
npm start
npm run demo  
npm test   
```

Then quit with `Ctrl-C` to exit.

## How it works

Three Polymarket sources feed the panel:

| What                       | Where it comes from                                                             |
| -------------------------- | ------------------------------------------------------------------------------- |
| Which market is live       | a computed slug, looked up through the Gamma API (`gamma-api.polymarket.com`) |
| Up / Down odds             | the CLOB order book (`clob.polymarket.com/book`), best ask on each side       |
| Live price + price-to-beat | the real-time WebSocket (`wss://ws-live-data.polymarket.com`)                 |

### Finding the active market

I don't search for it. These 5 minute markets are clock-aligned and their slugs are predictable: `btc-updown-5m-<window-start>`, where the window start is the current time floored to the nearest 5 minute boundary. So I just work out the slug from the clock and ask Gamma for that one market. Polling the "active markets" list instead would lag by a few seconds every time a new window opens, while the freshly created market gets indexed.

One thing that bit me while building this: if you query Gamma for a slug that doesn't exist yet, it hands back an unrelated list of markets rather than an empty result. So the code double-checks that the slug it got back actually matches what it asked for, and treats a mismatch as "not ready yet, try again next second."

### Up / Down odds

These are the price to *buy* each side, which is the best (lowest) ask on that outcome's token, pulled from the order book each second. When a side has no asks at all which tends to happen late in a window once the result is basically decided. There's no buy price, so it shows `N/A`, the same as the challenge's sample output. The two tokens are matched to their "Up"/"Down" labels rather than trusting array order, so the columns can't silently swap if Polymarket returns them the other way round.

### Price-to-beat

This is the BTC price at the moment the window opened. The part I had to think about was getting it cleanly: it turns out the very first price tick I receive inside a window *is* the opening price by definition, so I just remember the first tick of each window and that's it. Both that and the live price come from Chainlink's BTC/USD feed, because that's what these markets actually settle against, which keeps the two numbers directly comparable. If you start the script halfway through a window you've already missed the open, so there's a fallback to Polymarket's price-to-beat endpoint, with Binance as a last resort.

## Why I built it this way

The split between streaming and polling is deliberate. The live price runs over the WebSocket because it has to feel instant. It updates several times a second on its own, independent of the redraw. The Up/Down odds only need to be about a second fresh to keep pace with the once-per-second panel, so I just poll the order book each tick. That's a lot simpler than subscribing to the CLOB's market-channel socket and maintaining my own copy of the book, and if I ever needed sub-second odds I could swap it in without touching the rest.

Everything on screen is read from one small `state` object. When an API call fails, I keep whatever was there last and write the error into the footer instead of blanking the panel, so a single bad response never takes the display down. The WebSocket looks after itself too: it pings every five seconds (the server drops the connection otherwise), reconnects with a backoff if it falls over, and the price gets flagged as stale if it stops moving.

The refresh loop schedules itself with `setTimeout` rather than `setInterval`, so the next tick only fires once the current one has finished. That stops a slow network round-trip from piling requests on top of each other. Rendering is just a handful of ANSI escapes: move the cursor back up over the previous frame and overwrite it line by line, which leaves your terminal scrollback alone instead of clearing the whole screen.

## Project layout

```
src/
  index.js           orchestration: the 1s loop + lifecycle
  config.js          all endpoints and tunables in one place
  marketDiscovery.js window math + Gamma lookup → token IDs
  orderbook.js       CLOB best-ask reads for Up/Down
  priceFeed.js       WebSocket: live price + capturing each window's open
  priceToBeat.js     HTTP price-to-beat fallback
  view.js            pure function: state snapshot → frame lines
  render.js          terminal renderer + formatting helpers
  demo.js            offline synthetic-data preview
test/
  offline.test.js    deterministic logic (window math, formatting, open capture)
  http.test.js       Gamma/CLOB parsing, with a stubbed fetch
```

## Possible suggestion/ Further improvement

Right now it follows the one market (BTC, 5-minute), but the asset, symbols and window length all live in config, and the renderer builds each frame from a plain snapshot, so adding ETH or a 15-minute variant, or showing a few panels side by side is mostly wiring rather than new logic. To watch a lot of markets at once I'd switch the per-tick order-book GETs over to the CLOB batch endpoint and the market-channel socket. As it stands the load is tiny: roughly two order-book requests a second plus the single socket, and Gamma only gets hit once per window.

The one rough edge worth flagging: the HTTP price-to-beat endpoint I use as a fallback is documented for equity markets, so I'm not fully certain it serves crypto slugs. In practice maybe it doesn't matter much (i think), since the WebSocket capture gives an exact price-to-beat from the next window boundary regardless, but it's the piece I'm least sure about.
