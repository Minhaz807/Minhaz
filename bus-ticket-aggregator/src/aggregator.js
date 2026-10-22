import { canonicalCity } from './cities.js';

const CACHE_TTL_MS = 60_000;
const PROVIDER_TIMEOUT_MS = 25_000;

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function validateQuery({ from, to, date }) {
  if (!from || !to) return 'Both "from" and "to" are required';
  if (canonicalCity(from) === canonicalCity(to)) return '"from" and "to" must be different';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || isNaN(new Date(date))) return '"date" must be YYYY-MM-DD';
  return null;
}

export function sortTrips(trips, sort = 'fare') {
  const key = {
    fare: (t) => t.fare ?? Infinity,
    departure: (t) => t.departureTime ?? '99:99',
    seats: (t) => -(t.seatsAvailable ?? -1),
  }[sort] || ((t) => t.fare ?? Infinity);
  return [...trips].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

export function createAggregator(providers, { now = Date.now } = {}) {
  const cache = new Map();

  async function runProvider(p, q) {
    const started = now();
    const searchUrl = p.searchUrl(q.from, q.to, q.date);
    if (p.linkOnly || !p.search) {
      return { trips: [], status: { provider: p.key, name: p.name, status: 'link-only', count: 0, ms: 0, searchUrl } };
    }
    try {
      const trips = await withTimeout(p.search(q), PROVIDER_TIMEOUT_MS, p.name);
      return {
        trips,
        status: { provider: p.key, name: p.name, status: 'ok', count: trips.length, ms: now() - started, searchUrl },
      };
    } catch (err) {
      return {
        trips: [],
        status: { provider: p.key, name: p.name, status: err.blocked ? 'blocked' : 'error', count: 0, ms: now() - started, searchUrl, error: err.message },
      };
    }
  }

  return {
    providers,
    /** Query every provider in parallel; one failing never blocks the others. */
    async search(query) {
      const q = { from: canonicalCity(query.from), to: canonicalCity(query.to), date: query.date };
      const cacheKey = `${q.from}|${q.to}|${q.date}`;
      const hit = cache.get(cacheKey);
      if (hit && now() - hit.at < CACHE_TTL_MS) return { ...hit.value, cached: true };

      const results = await Promise.all(providers.map((p) => runProvider(p, q)));
      const value = {
        query: q,
        fetchedAt: new Date(now()).toISOString(),
        providers: results.map((r) => r.status),
        trips: results.flatMap((r) => r.trips),
      };
      // Only cache when at least one provider answered, so transient outages retry.
      if (value.providers.some((s) => s.status === 'ok')) cache.set(cacheKey, { at: now(), value });
      return { ...value, cached: false };
    },
  };
}
