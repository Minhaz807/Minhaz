// Shohoz (shohoz.com) adapter.
//
// The Shohoz web app fetches trips via an Angular service that sends
// from_city / to_city / date_of_journey to its SEARCH_TRIPS endpoint, but
// every call needs a per-session "handshake" hash first. Until that flow is
// wired up this adapter is link-only: it builds a pre-filled Shohoz search
// URL so the user lands directly on the results page with one tap.
// To add live results, implement search() returning Trip[] (see ../trip.js).

import { cityVariants } from '../cities.js';

const SITE = 'https://www.shohoz.com';

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

export default {
  key: 'shohoz',
  name: 'Shohoz',
  site: SITE,
  searchUrl,
  linkOnly: true,
};
