# BD Bus Finder: Bangladesh bus ticket aggregator

Search once and see bus trips from several Bangladeshi ticket sites side by side. You can sort and filter by fare, departure time, AC/Non-AC, operator or site. Then tap **Book** to finish on the original site.

| Site | Status |
|------|--------|
| **BDTickets** (bdtickets.com) | Live search through the same public API its website uses |
| **Shohoz** (shohoz.com) | Link only for now: opens Shohoz's results page with your route and date filled in |

## Run it

You need Node.js 18 or newer. It has no dependencies, so there's nothing to install.

```bash
cd bus-ticket-aggregator
npm start            # live mode, http://localhost:3000
npm run demo         # sample data, works offline (every trip is marked "demo")
npm test
```

Open it on your phone over the same Wi-Fi with `http://<your-computer-ip>:3000`. You can also choose **Add to Home Screen**, which makes it work like an app.

### Settings (environment variables)

| Variable | Purpose |
|----------|---------|
| `PORT` | Port to listen on (default `3000`) |
| `DEMO_MODE=1` | Use sample trips instead of live sites |
| `DISABLED_PROVIDERS=shohoz` | Comma-separated provider keys to turn off |
| `BDTICKETS_API` | Override the BDTickets API base URL |

## How it works

```
browser ──► /api/search?from=Dhaka&to=Chattogram&date=2026-11-05
              │
              ├─► BDTickets adapter ─► anonymous token → station lookup → search/initialize → poll results
              ├─► Shohoz adapter   ─► pre-filled search link
              └─► (more adapters)
              ▼
        merge + normalize → one sorted list (each site's results are cached for 60s)
```

- Every provider runs **in parallel** with a 25-second timeout. If one site is down or slow, the others still show.
- City spellings are normalized, so Chattogram/Chittagong, Cox's Bazar/Coxs Bazar and Barishal/Barisal all match. See `src/cities.js`.
- Every result is converted to one shared trip format (`src/trip.js`).

### API

- `GET /api/search?from=&to=&date=YYYY-MM-DD[&sort=fare|departure|seats]` returns `{ query, providers: [{name,status,count,error,searchUrl}], trips: [...] }`
- `GET /api/cities` returns the city list for autocomplete
- `GET /api/providers` returns the active providers

## Adapting providers

These sites don't publish official APIs, so adapters can break when a site changes.

- **BDTickets** (`src/providers/bdtickets.js`): the endpoints come from the bdtickets.com web app. The field names inside each search result aren't documented, so `normalizeResult()` checks several likely names. If trips show "Unknown operator" or no fare, log one raw result and add its field names to the `pick([...])` lists.
- **Shohoz** (`src/providers/shohoz.js`): the web app needs a per-session "handshake" hash before it calls its trip search (`from_city`, `to_city`, `date_of_journey`). Implement `search()` returning `Trip[]` and remove `linkOnly: true` to get live results.
- **Adding a site** (Jatri, a bus operator's own site, etc.): create `src/providers/<name>.js` exporting `{ key, name, site, searchUrl(from,to,date), search({from,to,date}) }`, then register it in `src/providers/index.js`.

## Notes

- Fares and seat counts are a snapshot taken at search time. Booking and payment always happen on the original site.
- Check each site's terms of use before you deploy this publicly or run frequent automated searches. For a production service, ask the sites for partner/affiliate API access.
