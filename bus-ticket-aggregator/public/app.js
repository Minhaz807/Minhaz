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

function render() {
  if (!lastResult) return;
  const coach = $('coach').value;
  const site = $('site').value;
  const op = $('operator').value.trim().toLowerCase();
  const sort = $('sort').value;

  let trips = lastResult.trips.filter(
    (t) => (!coach || t.coachType === coach) && (!site || t.provider === site) && (!op || t.operator.toLowerCase().includes(op)),
  );
  const key = { fare: (t) => t.fare ?? 1e9, departure: (t) => t.departureTime ?? '99:99', seats: (t) => -(t.seatsAvailable ?? -1) }[sort];
  trips = trips.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

  const cheapest = Math.min(...trips.map((t) => t.fare ?? Infinity));
  const { from, to, date } = lastResult.query;
  $('summary').innerHTML = trips.length
    ? `<b>${trips.length}</b> trips ${esc(from)} → ${esc(to)} on ${esc(date)}${lastResult.cached ? ' · cached' : ''}`
    : lastResult.trips.length
      ? 'No trips match these filters.'
      : 'No live trips found. Use the site buttons above to check each one directly.';

  $('results').innerHTML = trips
    .map((t) => {
      const name = lastResult.providers.find((p) => p.provider === t.provider)?.name || t.provider;
      const color = PROVIDER_COLORS[t.provider] || 'var(--ink-soft)';
      const seats = t.seatsAvailable == null ? '' : `<span class="${t.seatsAvailable < 5 ? 'low' : ''}">${t.seatsAvailable} seats</span>`;
      return `<li class="card trip">
        <div class="trip-main">
          <div class="op">${esc(t.operator)}${t.fare === cheapest && trips.length > 1 ? ' <span class="best">Cheapest</span>' : ''}</div>
          <div class="meta"><span class="tag">${esc(t.coachType)}</span>${t.coachName ? `<span>${esc(t.coachName)}</span>` : ''}${seats}</div>
          <div class="times"><b>${esc(t.departureTime || '--:--')}</b> → <b>${esc(t.arrivalTime || '--:--')}</b>
            ${t.boardingPoint ? `<small>${esc(t.boardingPoint)}${t.droppingPoint ? ` → ${esc(t.droppingPoint)}` : ''}</small>` : ''}</div>
        </div>
        <div class="trip-side">
          <div class="fare">${fmtFare(t.fare)}</div>
          <a class="book" href="${esc(t.bookingUrl)}" target="_blank" rel="noopener" style="--c:${color}">Book on ${esc(name)}</a>
          ${t.demo ? '<small class="demo">demo data</small>' : ''}
        </div>
      </li>`;
    })
    .join('');
}

init();
