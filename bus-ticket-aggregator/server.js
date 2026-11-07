import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAggregator, sortTrips, validateQuery } from './src/aggregator.js';
import { loadProviders } from './src/providers/index.js';
import { CITIES } from './src/cities.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const aggregator = createAggregator(loadProviders());

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function serveStatic(res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/cities') {
      return sendJson(res, 200, { cities: CITIES.map((c) => c[0]) });
    }
    if (url.pathname === '/api/providers') {
      return sendJson(res, 200, {
        providers: aggregator.providers.map((p) => ({ key: p.key, name: p.name, site: p.site, linkOnly: !!p.linkOnly })),
      });
    }
    if (url.pathname === '/api/search') {
      const q = Object.fromEntries(url.searchParams);
      const error = validateQuery(q);
      if (error) return sendJson(res, 400, { error });
      const result = await aggregator.search(q);
      return sendJson(res, 200, { ...result, trips: sortTrips(result.trips, q.sort) });
    }
    if (req.method === 'GET') return serveStatic(res, url.pathname);
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Internal error' });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    const names = aggregator.providers.map((p) => p.name).join(', ');
    console.log(`BD bus ticket aggregator on http://localhost:${PORT}  [${names}]`);
  });
}
