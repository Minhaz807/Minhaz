// Shohoz (shohoz.com) adapter.
//
// Uses the same public endpoints the shohoz.com web app calls from the
// browser (webapi.shohoz.com/v1.0/web):
//   POST /auth/sign-in  {}            -> { data: { token } }   (guest token)
//   GET  /booking/bus/search-trips?from_city=&to_city=&date_of_journey=&dor=
//                                     -> { data: { trips: { total, list: [...] }, filters } }
// date_of_journey uses the site's "27-Oct-2026" format. Trip fields come from
// the Shohoz search page code (company_name, economy_class_fare, ...); the
// mapping stays tolerant in case they drift.

import { fetchJson, HttpError } from '../http.js';
import { cityVariants } from '../cities.js';
import { pick, toNumber, toHHMM, normalizeCoachType, debugRaw } from '../trip.js';

const SITE = 'https://www.shohoz.com';
const API = process.env.SHOHOZ_API || 'https://webapi.shohoz.com/v1.0/web';
const TOKEN_TTL_MS = 30 * 60 * 1000;

// Shohoz still lists a few cities under their older English spellings.
const SHOHOZ_NAMES = {
  Chattogram: 'Chittagong',
  Cumilla: 'Comilla',
  Barishal: 'Barisal',
  Bogura: 'Bogra',
  Jashore: 'Jessore',
};

function shohozCity(city) {
  const canonical = cityVariants(city)[0];
  return SHOHOZ_NAMES[canonical] || canonical;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-27" -> "27-Oct-2026", the date format the Shohoz search form uses. */
export function shohozDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${MONTHS[parseInt(m, 10) - 1]}-${y}`;
}

export function searchUrl(from, to, date) {
  const qs = new URLSearchParams({
    fromcity: shohozCity(from),
    tocity: shohozCity(to),
    doj: shohozDate(date),
    dor: '',
  });
  return `${SITE}/bus-tickets/booking/bus/search?${qs}`;
}

const baseHeaders = {
  Origin: SITE,
  Referer: `${SITE}/`,
  'X-Requested-With': 'XMLHttpRequest',
};

let token = null; // { value, expiresAt }

async function getToken(force = false) {
  if (!force && token && token.expiresAt > Date.now()) return token.value;
  const res = await fetchJson(`${API}/auth/sign-in`, { method: 'POST', headers: baseHeaders, body: {} });
  const value = res?.data?.token ?? res?.token;
  if (!value) throw new Error('Shohoz did not return a guest token');
  token = { value, expiresAt: Date.now() + TOKEN_TTL_MS };
  return value;
}

/** Shohoz answers 403 to requests from cloud hosting (Render, etc.); flag it so the UI can explain. */
function markBlocked(err) {
  if (err instanceof HttpError && err.status === 403) {
    const e = new Error('Shohoz blocks searches from cloud servers');
    e.blocked = true;
    // Keep Shohoz's own reason so it shows up in /api/search for troubleshooting.
    const reason = typeof err.body === 'string' ? err.body : JSON.stringify(err.body ?? '');
    e.detail = `${err.path}: ${reason.slice(0, 300)}`;
    return e;
  }
  return err;
}

async function api(path) {
  const call = async (t) =>
    fetchJson(`${API}${path}`, { headers: { ...baseHeaders, 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } });
  try {
    try {
      return await call(await getToken());
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) return await call(await getToken(true));
      throw err;
    }
  } catch (err) {
    throw markBlocked(err);
  }
}

function pointName(points) {
  const first = Array.isArray(points) ? points[0] : points;
  if (!first) return null;
  return typeof first === 'string' ? first : pick(first, ['name', 'location_name', 'counter_name', 'title']);
}

const positive = (list) => list.map(toNumber).filter((n) => n != null && n > 0);

function listFare(r) {
  const fares = positive(['economy_class_fare', 'business_class_fare', 'special_class_fare', 'seat_fare', 'fare'].map((k) => r[k]));
  return fares.length ? Math.min(...fares) : null;
}

/** Operator discounts carry the final price per class in discount.fare_discount[].fare. */
function discountedFare(r) {
  const list = r.discount?.fare_discount;
  const fares = Array.isArray(list) ? positive(list.map((d) => d.fare)) : [];
  return fares.length ? Math.min(...fares) : null;
}

// bus_type codes seen on Shohoz; the free-text bus_desc wins when it says AC/Non AC.
const BUS_TYPE_CODES = { 1: 'AC', 2: 'Non-AC' };

function coachType(r) {
  const fromDesc = normalizeCoachType(r.bus_desc);
  if (fromDesc === 'AC' || fromDesc === 'Non-AC') return fromDesc;
  return BUS_TYPE_CODES[r.bus_type] || normalizeCoachType(r.bus_type_name ?? r.bus_type);
}

export function normalizeResult(r, { bookingUrl }) {
  const list = listFare(r);
  const discounted = discountedFare(r);
  const fare = Math.min(list ?? Infinity, discounted ?? Infinity);
  return {
    id: `shohoz:${pick(r, ['trip_route_id', 'trip_id', 'no']) ?? Math.random().toString(36).slice(2)}`,
    provider: 'shohoz',
    operator: String(pick(r, ['company_name', 'operator_name']) || 'Unknown operator').replace(/\s+/g, ' ').trim(),
    coachType: coachType(r),
    coachName: pick(r, ['bus_desc', 'trip_heading']) || (r.trip_number ? `Coach #${r.trip_number}` : null),
    departureTime: toHHMM(pick(r, ['departure_time'])),
    arrivalTime: toHHMM(pick(r, ['arrival_time'])),
    boardingPoint: pointName(r.boarding_points) || pick(r, ['origin_city_name']),
    droppingPoint: pointName(r.dropping_points) || pick(r, ['destination_city_name']),
    fare: fare === Infinity ? null : fare,
    originalFare: list != null && discounted != null && list > discounted ? list : null,
    seatsAvailable: toNumber(pick(r, ['noOfSeatsAvailable', 'available_seats', 'seats_available'])),
    bookingUrl,
  };
}

export default {
  key: 'shohoz',
  name: 'Shohoz',
  site: SITE,
  searchUrl,

  async search({ from, to, date }) {
    const qs = new URLSearchParams({
      from_city: shohozCity(from),
      to_city: shohozCity(to),
      date_of_journey: shohozDate(date),
      dor: '',
    });
    const res = await api(`/booking/bus/search-trips?${qs}`);
    const data = res?.data ?? res;
    const list = data?.trips?.list ?? (Array.isArray(data?.trips) ? data.trips : []);
    const bookingUrl = searchUrl(from, to, date);
    debugRaw('shohoz', list);
    return list.map((r) => normalizeResult(r, { bookingUrl }));
  },
};
