const $ = (id) => document.getElementById(id);
const PROVIDER_COLORS = { bdtickets: 'var(--bdtickets)', shohoz: 'var(--shohoz)' };

let lastResult = null;

function todayDhaka() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function fmtFare(n) {
  return n == null ? '—' : `৳${n.toLocaleString('en-IN')}`;
}

function remember(q) {
  try {
    localStorage.setItem('lastSearch', JSON.stringify(q));
  } catch {}
}

function recall() {
  try {
    return JSON.parse(localStorage.getItem('lastSearch') || 'null');
  } catch {
    return null;
  }
}

async function init() {
  const { cities } = await fetch('/api/cities').then((r) => r.json());
  $('cities').innerHTML = cities.map((c) => `<option value="${esc(c)}">`).join('');

  const params = new URLSearchParams(location.search);
  const saved = recall() || {};
  $('from').value = params.get('from') || saved.from || 'Dhaka';
  $('to').value = params.get('to') || saved.to || 'Chattogram';
  $('date').min = todayDhaka();
  $('date').value = params.get('date') || (saved.date >= todayDhaka() ? saved.date : todayDhaka());

  $('swap').onclick = () => ([$('from').value, $('to').value] = [$('to').value, $('from').value]);
  $('search').onsubmit = (e) => {
    e.preventDefault();
    search();
  };
  for (const id of ['sort', 'coach', 'site', 'operator']) $(id).oninput = render;

  if (params.get('from') && params.get('to')) search();
}

async function search() {
  const q = { from: $('from').value.trim(), to: $('to').value.trim(), date: $('date').value };
  remember(q);
  history.replaceState(null, '', `?${new URLSearchParams(q)}`);

  $('go').disabled = true;
  $('go').textContent = 'Searching…';
  $('results').innerHTML = '';
  $('summary').textContent = '';
  $('status').innerHTML = '<div class="chip">Checking every site — live searches can take up to 20 seconds…</div>';

  try {
    const res = await fetch(`/api/search?${new URLSearchParams(q)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Search failed (${res.status})`);
    lastResult = data;
    renderStatus(data);
    const sites = [...new Set(data.trips.map((t) => t.provider))];
    $('site').innerHTML =
      '<option value="">All</option>' +
      sites.map((k) => `<option value="${esc(k)}">${esc(data.providers.find((p) => p.provider === k)?.name || k)}</option>`).join('');
    $('filters').hidden = data.trips.length === 0;
    render();
  } catch (err) {
    $('status').innerHTML = `<div class="chip error">${esc(err.message)}</div>`;
  } finally {
    $('go').disabled = false;
    $('go').textContent = 'Search all sites';
  }
}

function renderStatus(data) {
  $('status').innerHTML = data.providers
    .map((p) => {
      const color = PROVIDER_COLORS[p.provider.replace(/-demo$/, '')] || 'var(--ink-soft)';
      const label =
        p.status === 'ok'
          ? `${p.count} trip${p.count === 1 ? '' : 's'} · ${(p.ms / 1000).toFixed(1)}s`
          : p.status === 'link-only'
            ? 'Live results not available yet'
            : `Couldn't load: ${esc(p.error)}`;
      return `<a class="chip ${p.status}" href="${esc(p.searchUrl)}" target="_blank" rel="noopener" style="--c:${color}">
        <b>${esc(p.name)}</b><span>${label}</span><em>Open site ↗</em></a>`;
    })
    .join('');
}

const opKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** The same bus is often sold on several sites: merge those into one card with one offer per site. */
function groupTrips(trips) {
  const groups = new Map();
  for (const t of trips) {
    const key = `${opKey(t.operator)}|${t.departureTime}|${t.coachType}`;
    if (!groups.has(key)) groups.set(key, { ...t, offers: [] });
    const g = groups.get(key);
    const existing = g.offers.find((o) => o.provider === t.provider);
    if (!existing) g.offers.push(t);
    else if ((t.fare ?? Infinity) < (existing.fare ?? Infinity)) g.offers[g.offers.indexOf(existing)] = t;
  }
  for (const g of groups.values()) {
    g.offers.sort((a, b) => (a.fare ?? Infinity) - (b.fare ?? Infinity));
    const best = g.offers[0];
    Object.assign(g, { fare: best.fare, seatsAvailable: Math.max(...g.offers.map((o) => o.seatsAvailable ?? -1)) });
    if (g.seatsAvailable < 0) g.seatsAvailable = null;
    for (const f of ['coachName', 'boardingPoint', 'droppingPoint', 'arrivalTime']) g[f] = g[f] ?? g.offers.find((o) => o[f])?.[f] ?? null;
  }
  return [...groups.values()];
}

function render() {
  if (!lastResult) return;
  const coach = $('coach').value;
  const site = $('site').value;
  const op = $('operator').value.trim().toLowerCase();
  const sort = $('sort').value;

  const filtered = lastResult.trips.filter(
    (t) => (!coach || t.coachType === coach) && (!site || t.provider === site) && (!op || t.operator.toLowerCase().includes(op)),
  );
  const key = { fare: (t) => t.fare ?? 1e9, departure: (t) => t.departureTime ?? '99:99', seats: (t) => -(t.seatsAvailable ?? -1) }[sort];
  const buses = groupTrips(filtered).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

  const cheapestBus = buses.reduce((best, t) => ((t.fare ?? Infinity) < (best?.fare ?? Infinity) ? t : best), null);
  const multi = buses.filter((b) => b.offers.length > 1).length;
  const { from, to, date } = lastResult.query;
  $('summary').innerHTML = buses.length
    ? `<b>${buses.length}</b> buses ${esc(from)} → ${esc(to)} on ${esc(date)}${multi ? ` · ${multi} sold on more than one site` : ''}${lastResult.cached ? ' · cached' : ''}`
    : lastResult.trips.length
      ? 'No trips match these filters.'
      : 'No live trips found. Use the site buttons above to check each one directly.';

  const providerName = (k) => lastResult.providers.find((p) => p.provider === k)?.name || k;
  $('results').innerHTML = buses
    .slice(0, 300)
    .map((t) => {
      const seats = t.seatsAvailable == null ? '' : `<span class="${t.seatsAvailable < 5 ? 'low' : ''}">${t.seatsAvailable} seats</span>`;
      const offers = t.offers
        .map(
          (o, i) =>
            `<a class="book${i ? ' alt' : ''}" href="${esc(o.bookingUrl)}" target="_blank" rel="noopener" style="--c:${PROVIDER_COLORS[o.provider] || 'var(--ink-soft)'}">${esc(providerName(o.provider))} · ${fmtFare(o.fare)}</a>`,
        )
        .join('');
      return `<li class="card trip">
        <div class="trip-main">
          <div class="op">${esc(t.operator)}${t === cheapestBus && buses.length > 1 ? ' <span class="best">Cheapest</span>' : ''}</div>
          <div class="meta"><span class="tag">${esc(t.coachType)}</span>${t.coachName ? `<span>${esc(t.coachName)}</span>` : ''}${seats}</div>
          <div class="times"><b>${esc(t.departureTime || '--:--')}</b> → <b>${esc(t.arrivalTime || '--:--')}</b>
            ${t.boardingPoint ? `<small>${esc(t.boardingPoint)}${t.droppingPoint ? ` → ${esc(t.droppingPoint)}` : ''}</small>` : ''}</div>
        </div>
        <div class="trip-side">
          <div class="fare">${fmtFare(t.fare)}</div>
          <div class="offers">${offers}</div>
          ${t.demo ? '<small class="demo">demo data</small>' : ''}
        </div>
      </li>`;
    })
    .join('');
}

init();
