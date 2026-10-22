/**
 * Normalized trip shape shared by every provider.
 *
 * @typedef {Object} Trip
 * @property {string} id            provider-scoped unique id
 * @property {string} provider      provider key, e.g. "bdtickets"
 * @property {string} operator      bus company, e.g. "Green Line Paribahan"
 * @property {string} coachType     "AC" | "Non-AC" | free text from the provider
 * @property {string|null} coachName  e.g. "Scania Multi-Axle", "Hino 1J"
 * @property {string|null} departureTime  "HH:MM" 24h local time
 * @property {string|null} arrivalTime    "HH:MM" 24h local time
 * @property {string|null} boardingPoint
 * @property {string|null} droppingPoint
 * @property {number|null} fare     lowest fare in BDT
 * @property {number|null} seatsAvailable
 * @property {string} bookingUrl    where the user completes the booking
 */

/** Return the first non-empty value found at any of the dotted paths. */
export function pick(obj, paths) {
  for (const p of paths) {
    let v = obj;
    for (const k of p.split('.')) {
      if (v == null) break;
      v = v[k];
    }
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

export function toNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Accepts "07:30", "7:30 AM", ISO datetimes or epoch ms and returns "HH:MM". */
export function toHHMM(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d) ? null : dhakaHHMM(d);
  }
  const s = String(v).trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12;
    if (/p/i.test(ampm[3])) h += 12;
    return `${String(h).padStart(2, '0')}:${ampm[2]}`;
  }
  const plain = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (plain) return `${plain[1].padStart(2, '0')}:${plain[2]}`;
  // "2026-10-28 12:00:00" with no zone is already Dhaka wall-clock time.
  const local = s.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (local) return `${local[1]}:${local[2]}`;
  const d = new Date(s);
  return isNaN(d) ? null : dhakaHHMM(d);
}

function dhakaHHMM(d) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Dhaka',
  }).format(d);
}

export function normalizeCoachType(v) {
  const s = String(v ?? '').toLowerCase();
  if (!s) return 'Unknown';
  if (/non[\s-]?a[./]?c/.test(s)) return 'Non-AC';
  if (/\ba[./]?c\b|\bair[\s-]?con/.test(s)) return 'AC';
  return String(v);
}

/** With DEBUG_PROVIDERS=1, print one raw provider row so field mappings can be checked. */
export function debugRaw(provider, rows) {
  if (process.env.DEBUG_PROVIDERS === '1' && rows?.length) {
    console.log(`[${provider}] raw result sample:\n${JSON.stringify(rows[0], null, 2)}`);
  }
}
