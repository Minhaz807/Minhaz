import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAggregator, sortTrips, validateQuery } from '../src/aggregator.js';
import { canonicalCity, cityVariants } from '../src/cities.js';
import { toHHMM, normalizeCoachType } from '../src/trip.js';
import { normalizeResult, resolveStation } from '../src/providers/bdtickets.js';
import shohoz, { shohozDate } from '../src/providers/shohoz.js';
import { loadProviders } from '../src/providers/index.js';

const trip = (over) => ({ provider: 'x', operator: 'Op', coachType: 'AC', fare: 1000, departureTime: '08:00', seatsAvailable: 10, ...over });

test('city aliases resolve to one canonical name', () => {
  assert.equal(canonicalCity('chittagong'), 'Chattogram');
  assert.equal(canonicalCity("Cox's Bazar"), "Cox's Bazar");
  assert.equal(canonicalCity('coxs bazar'), "Cox's Bazar");
  assert.deepEqual(cityVariants('Barisal'), ['Barishal', 'Barisal']);
  assert.equal(canonicalCity('Somewhere'), 'Somewhere');
});

test('validateQuery', () => {
  assert.equal(validateQuery({ from: 'Dhaka', to: 'Sylhet', date: '2026-11-01' }), null);
  assert.match(validateQuery({ from: 'Dhaka', to: 'dhaka', date: '2026-11-01' }), /different/);
  assert.match(validateQuery({ from: 'Dhaka', to: 'Sylhet', date: '01-11-2026' }), /YYYY-MM-DD/);
  assert.match(validateQuery({ from: '', to: 'Sylhet', date: '2026-11-01' }), /required/);
});

test('time and coach normalization', () => {
  assert.equal(toHHMM('7:30 PM'), '19:30');
  assert.equal(toHHMM('12:05 am'), '00:05');
  assert.equal(toHHMM('06:45:00'), '06:45');
  assert.equal(toHHMM('2026-11-01T02:00:00Z'), '08:00'); // Asia/Dhaka is UTC+6
  assert.equal(normalizeCoachType('NON AC'), 'Non-AC');
  assert.equal(normalizeCoachType('A/C'), 'AC');
  assert.equal(normalizeCoachType('ac'), 'AC');
});

test('sortTrips puts missing values last', () => {
  const trips = [trip({ fare: null }), trip({ fare: 500 }), trip({ fare: 900 })];
  assert.deepEqual(sortTrips(trips, 'fare').map((t) => t.fare), [500, 900, null]);
  assert.deepEqual(sortTrips([trip({ departureTime: '21:00' }), trip({ departureTime: '06:30' })], 'departure').map((t) => t.departureTime), ['06:30', '21:00']);
});

test('aggregator merges providers and isolates failures', async () => {
  const ok = { key: 'a', name: 'A', searchUrl: () => 'https://a', search: async () => [trip({ provider: 'a' })] };
  const bad = { key: 'b', name: 'B', searchUrl: () => 'https://b', search: async () => { throw new Error('boom'); } };
  const link = { key: 'c', name: 'C', searchUrl: () => 'https://c', linkOnly: true };
  const agg = createAggregator([ok, bad, link]);
  const r = await agg.search({ from: 'dhaka', to: 'chittagong', date: '2026-11-01' });
  assert.deepEqual(r.query, { from: 'Dhaka', to: 'Chattogram', date: '2026-11-01' });
  assert.equal(r.trips.length, 1);
  assert.deepEqual(r.providers.map((p) => p.status), ['ok', 'error', 'link-only']);
  assert.equal(r.providers[1].error, 'boom');
  const again = await agg.search({ from: 'Dhaka', to: 'Chattogram', date: '2026-11-01' });
  assert.equal(again.cached, true);
});

test('bdtickets station resolution and tolerant result mapping', () => {
  const list = [
    { code: 'dhaka', name: 'Dhaka', district: 'Dhaka' },
    { code: 'chattogram', name: 'Chattogram', district: 'Chattogram' },
  ];
  assert.equal(resolveStation(list, 'Chittagong').code, 'chattogram');
  assert.equal(resolveStation(list, 'Nowhere'), null);

  const t = normalizeResult(
    { id: 7, operator: { name: 'Green Line' }, coachType: 'AC', departureTime: '10:30 PM', fare: { min: '1,450' }, availableSeats: 12 },
    { bookingUrl: 'https://bdtickets.com/x' },
  );
  assert.equal(t.id, 'bdtickets:7');
  assert.equal(t.operator, 'Green Line');
  assert.equal(t.departureTime, '22:30');
  assert.equal(t.fare, 1450);
  assert.equal(t.seatsAvailable, 12);
});

test('shohoz deep link uses its date format and legacy spellings', () => {
  assert.equal(shohozDate('2026-10-27'), '27-Oct-2026');
  const u = new URL(shohoz.searchUrl('Chattogram', "Cox's Bazar", '2026-10-27'));
  assert.equal(u.searchParams.get('fromcity'), 'Chittagong');
  assert.equal(u.searchParams.get('tocity'), "Cox's Bazar");
  assert.equal(u.searchParams.get('doj'), '27-Oct-2026');
});

test('demo mode returns labelled sample trips with real booking links', async () => {
  const agg = createAggregator(loadProviders({ DEMO_MODE: '1' }));
  const r = await agg.search({ from: 'Dhaka', to: 'Sylhet', date: '2026-11-01' });
  assert.ok(r.trips.length > 0);
  assert.ok(r.trips.every((t) => t.demo));
  assert.ok(r.trips.some((t) => t.bookingUrl.startsWith('https://www.shohoz.com/')));
});
