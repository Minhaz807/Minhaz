// BDTickets (bdtickets.com) adapter.
//
// Uses the same public endpoints the bdtickets.com web app calls from the
// browser (apiv1.bdtickets.com/api/v1):
//   POST /auth/anonymous            -> { access_token, expires_in }
//   GET  /stations/mapping          -> { data: [{ id, code, name, district, ... }] }
//   POST /search/initialize         -> { searchId }
//   GET  /search/:id/results?...    -> { data: { status, progress, results|partialResults } }
// Search is asynchronous on their side, so results are polled until complete.
// Field names inside each result are not documented, so the mapping below is
// deliberately tolerant; see README "Adapting providers" if it drifts.

import { randomUUID } from 'node:crypto';
import { fetchJson, sleep } from '../http.js';
import { cityVariants, normalizeKey, slugify } from '../cities.js';
import { pick, toNumber, toHHMM, normalizeCoachType } from '../trip.js';

const API = process.env.BDTICKETS_API || 'https://apiv1.bdtickets.com/api/v1';
const SITE = 'https://bdtickets.com';
const STATIONS_TTL_MS = 6 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_MS = 20000;

const deviceId = process.env.BDTICKETS_DEVICE_ID || `bd-bus-aggregator-${randomUUID()}`;
let token = null; // { value, expiresAt }
let stations = null; // { list, fetchedAt }

const baseHeaders = {
  Origin: SITE,
  Referer: `${SITE}/`,
  'x-platform': 'web',
  'x-channel': 'direct',
};

async function getToken() {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetchJson(`${API}/auth/anonymous`, {
    method: 'POST',
    headers: baseHeaders,
    body: { device_id: deviceId },
  });
  const value = res?.access_token ?? res?.data?.access_token;
  if (!value) throw new Error('BDTickets did not return an access token');
  const ttl = (res?.expires_in ?? res?.data?.expires_in ?? 3600) * 1000;
  token = { value, expiresAt: Date.now() + ttl };
  return value;
}

async function api(path, opts = {}) {
  const t = await getToken();
  return fetchJson(`${API}${path}`, {
    ...opts,
    headers: { ...baseHeaders, Authorization: `Bearer ${t}`, ...(opts.headers || {}) },
  });
}

async function getStations() {
  if (stations && Date.now() - stations.fetchedAt < STATIONS_TTL_MS) return stations.list;
  const res = await api('/stations/mapping');
  const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  stations = { list, fetchedAt: Date.now() };
  return list;
}

/** Map a city name to a BDTickets station code ("dhaka", "chattogram", ...). */
export function resolveStation(list, city) {
  const keys = cityVariants(city).map(normalizeKey);
  const byField = (field) =>
    list.find((s) => s.isActive !== false && keys.includes(normalizeKey(s[field])));
  return byField('code') || byField('name') || byField('district') || null;
}

export function searchUrl(from, to, date) {
  return `${SITE}/travel/search/bus/${slugify(from)}-to-${slugify(to)}?departDate=${date}`;
}

function isComplete(r) {
  return r?.progress?.overall?.percentage === 100 || ['COMPLETED', 'TIMEOUT'].includes(r?.status);
}

export function normalizeResult(r, { bookingUrl }) {
  const operator =
    pick(r, ['operator.name', 'operatorName', 'companyName', 'company.name', 'busOperator.name', 'busOperator', 'operator']) ||
    'Unknown operator';
  const coachRaw = pick(r, ['coachType', 'busType', 'isAc', 'ac', 'vehicle.coachType', 'seatType']);
  const coachType =
    typeof coachRaw === 'boolean' ? (coachRaw ? 'AC' : 'Non-AC') : normalizeCoachType(coachRaw);
  return {
    id: `bdtickets:${pick(r, ['id', 'tripId', 'trip_id', 'scheduleId', 'key']) ?? Math.random().toString(36).slice(2)}`,
    provider: 'bdtickets',
    operator: typeof operator === 'string' ? operator : String(operator?.name ?? 'Unknown operator'),
    coachType,
    coachName: pick(r, ['coachName', 'busName', 'vehicle.name', 'brand', 'coachNo', 'coachNumber']),
    departureTime: toHHMM(pick(r, ['departureTime', 'departure_time', 'departure.time', 'departureDateTime', 'startTime', 'departure'])),
    arrivalTime: toHHMM(pick(r, ['arrivalTime', 'arrival_time', 'arrival.time', 'arrivalDateTime', 'endTime', 'arrival'])),
    boardingPoint: pick(r, ['boardingPoint.name', 'boardingStation.name', 'startingPoint', 'origin.name', 'from']),
    droppingPoint: pick(r, ['droppingPoint.name', 'droppingStation.name', 'endingPoint', 'destination.name', 'to']),
    fare: toNumber(pick(r, ['fare.min', 'minFare', 'lowestFare', 'price.min', 'price', 'fare', 'seatFare', 'amount'])),
    seatsAvailable: toNumber(pick(r, ['availableSeats', 'seatsAvailable', 'available_seats', 'seatAvailability.available', 'totalAvailableSeats'])),
    bookingUrl,
  };
}

export default {
  key: 'bdtickets',
  name: 'BDTickets',
  site: SITE,
  searchUrl,

  async search({ from, to, date }) {
    const list = await getStations();
    const origin = resolveStation(list, from);
    const destination = resolveStation(list, to);
    if (!origin) throw new Error(`BDTickets has no station matching "${from}"`);
    if (!destination) throw new Error(`BDTickets has no station matching "${to}"`);

    const init = await api('/search/initialize', {
      method: 'POST',
      body: {
        transportType: 'BUS',
        origin: origin.code,
        destination: destination.code,
        departureDate: date,
        passengers: { adults: 1, children: 0, infants: 0 },
      },
    });
    const searchId = init?.searchId ?? init?.data?.searchId;
    if (!searchId) throw new Error('BDTickets search did not return a searchId');

    const bookingUrl = searchUrl(origin.code, destination.code, date);
    const deadline = Date.now() + POLL_MAX_MS;
    let latest = null;
    while (true) {
      const qs = new URLSearchParams({ sortBy: 'price', sortOrder: 'asc', page: '1', limit: '100', version: '0' });
      const res = await api(`/search/${encodeURIComponent(searchId)}/results?${qs}`);
      latest = res?.data ?? res;
      if (isComplete(latest) || Date.now() > deadline) break;
      await sleep(POLL_INTERVAL_MS);
    }
    const rows = latest?.results?.length ? latest.results : latest?.partialResults ?? [];
    return rows.map((r) => normalizeResult(r, { bookingUrl }));
  },
};
