# BD Bus Finder: Bangladesh bus ticket aggregator

Search once and see bus trips from several Bangladeshi ticket sites side by side. You can sort and filter by fare, departure time, AC/Non-AC, operator or site. Then tap **Book** to finish on the original site.

| Site | Status |
|------|--------|
| **BDTickets** (bdtickets.com) | Live search through the same public API its website uses |
| **Shohoz** (shohoz.com) | Live search through the same public API its website uses (guest token, then trip search) |

## Run it

You need Node.js 18 or newer. It has no dependencies, so there's nothing to install.

```bash
cd bus-ticket-aggregator
npm start            # live mode, http://localhost:3000
npm run demo         # sample data, works offline (every trip is marked "demo")
npm test
```

Open it on your phone over the same Wi-Fi with `http://<your-computer-ip>:3000`. You can also choose **Add to Home Screen**, which makes it work like an app.

## Put it online for free (Render)

Render's free plan hosts this app with no credit card. The free server sleeps after 15 minutes with no visitors, and the first visit after that takes about a minute to wake it.

1. Sign up at https://render.com with your GitHub account.
2. Click **New → Blueprint** and pick the `Minhaz807/Minhaz` repository. Render reads `render.yaml` from the repo root and sets everything up (branch, folder, Singapore region, free plan).
   - If Render doesn't offer that branch, use **New → Web Service** instead and enter: branch `claude/bd-bus-ticket-aggregator-9bzszk`, root directory `bus-ticket-aggregator`, build `npm install`, start `npm start`, instance type **Free**.
3. Click **Deploy**. After a minute or two you get a link like `https://bd-bus-finder.onrender.com`. Open it on your phone and choose **Add to Home Screen**.

Once this branch is merged into `main`, delete the `branch:` line in `render.yaml` so Render deploys from `main`.

**Shohoz on Render:** Shohoz blocks searches that come from cloud servers (it answers `403 Forbidden`), so the Render link only lists BDTickets trips. The Shohoz box still opens Shohoz's own results for your route in one tap. BDTickets works fine from Render.

## Run it on your Android phone (free, includes Shohoz)

Running the app on your own phone uses your normal mobile or Wi-Fi connection, so Shohoz allows it.

1. Install **Termux** from F-Droid (https://f-droid.org/packages/com.termux/). The Play Store version is outdated.
2. In Termux, run once:
   ```bash
   pkg update -y && pkg install -y nodejs git
   git clone -b claude/bd-bus-ticket-aggregator-9bzszk https://github.com/Minhaz807/Minhaz.git
   ```
3. Every time you want to use it:
   ```bash
   cd Minhaz/bus-ticket-aggregator && npm start
   ```
4. Open **http://localhost:3000** in Chrome on the same phone. Keep Termux open in the background while you search.

To get the latest version later: `cd ~/Minhaz && git pull`.

On a Windows or Mac computer, install Node.js from https://nodejs.org, download the code, then run `npm start` in the `bus-ticket-aggregator` folder.

### Settings (environment variables)

| Variable | Purpose |
|----------|---------|
| `PORT` | Port to listen on (default `3000`) |
| `DEMO_MODE=1` | Use sample trips instead of live sites |
| `DISABLED_PROVIDERS=shohoz` | Comma-separated provider keys to turn off |
| `BDTICKETS_API` / `SHOHOZ_API` | Override a provider's API base URL |

## How it works

```
browser ──► /api/search?from=Dhaka&to=Chattogram&date=2026-11-05
              │
              ├─► BDTickets adapter ─► anonymous token → station lookup → search/initialize → poll results
              ├─► Shohoz adapter   ─► guest sign-in → search-trips
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
- **Shohoz** (`src/providers/shohoz.js`): gets a guest token from `/auth/sign-in`, then calls `/booking/bus/search-trips` with `from_city`, `to_city` and `date_of_journey` (format `27-Oct-2026`). Field names come from the Shohoz search page code. If seat counts never show up, log one raw trip and add its seat field to the `seatsAvailable` list.
- To make a provider link-only (a button, no live results), set `linkOnly: true` on it.
- **Adding a site** (Jatri, a bus operator's own site, etc.): create `src/providers/<name>.js` exporting `{ key, name, site, searchUrl(from,to,date), search({from,to,date}) }`, then register it in `src/providers/index.js`.

## Debugging

Run with `DEBUG_PROVIDERS=1 npm start` to print one raw result from each site. Use it to check or update the field mappings.

## Notes

- The same bus is often sold on both sites. Those trips are merged into one card with a price button per site (matched on operator, departure time and coach type).
- Some operators on BDTickets (e.g. long routes that pass through your city) report the time and counter where the whole route starts, not your stop. That comes from the site's own data.

- Fares and seat counts are a snapshot taken at search time. Booking and payment always happen on the original site.
- Check each site's terms of use before you deploy this publicly or run frequent automated searches. For a production service, ask the sites for partner/affiliate API access.
