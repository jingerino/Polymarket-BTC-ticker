import { CONFIG } from './config.js';

// making fetch safe to call in a loop.
// The one thing this adds over the global fetch is a hard timeout, using AbortController. 
// without it, a single slow request could stall the once-a-second cadence, because fetch has no default timeout. 

export async function getJson(url, { timeoutMs = CONFIG.httpTimeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Same as getJson but tolerates a bare numeric body (the price-to-beat endpoint
// is not guaranteed to return JSON), returning the raw text on parse failure.
export async function getJsonOrText(url, { timeoutMs = CONFIG.httpTimeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(timer);
  }
}
