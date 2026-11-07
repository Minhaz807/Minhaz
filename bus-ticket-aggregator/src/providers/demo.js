// Demo provider: deterministic sample trips so the UI can be tried offline.
// Only registered when DEMO_MODE=1. Every result is labelled as demo data.

const OPERATORS = [
  ['Green Line Paribahan', 'AC', 'Volvo B11R'],
  ['Hanif Enterprise', 'Non-AC', 'Hino 1J'],
  ['Shyamoli NR Travels', 'AC', 'Hyundai Universe'],
  ['Ena Transport', 'AC', 'Scania K410'],
  ['Saudia Coach Service', 'Non-AC', 'Ashok Leyland'],
  ['Desh Travels', 'AC', 'Hino RN8J'],
  ['Shohagh Paribahan', 'AC', 'Scania Multi-Axle'],
  ['S. Alam Service', 'Non-AC', 'Hino 1J'],
];

function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return h / 4294967296;
  };
}

/** Wraps a real provider: same key and booking links, fake trips. */
export function demoProvider(real) {
  const { key } = real;
  return {
    key,
    name: `${real.name} (demo)`,
    site: real.site,
    searchUrl: real.searchUrl,
    async search({ from, to, date }) {
      const bookingUrl = real.searchUrl(from, to, date);
      const rand = seeded(`${key}|${from}|${to}|${date}`);
      const n = 4 + Math.floor(rand() * 5);
      return Array.from({ length: n }, (_, i) => {
        const [operator, coachType, coachName] = OPERATORS[Math.floor(rand() * OPERATORS.length)];
        const dep = 6 * 60 + Math.floor(rand() * 17 * 60);
        const dur = 5 * 60 + Math.floor(rand() * 4 * 60);
        const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const base = coachType === 'AC' ? 1200 : 650;
        return {
          id: `${key}:demo-${i}`,
          provider: key,
          operator,
          coachType,
          coachName,
          departureTime: hhmm(dep),
          arrivalTime: hhmm(dep + dur),
          boardingPoint: `${from} counter`,
          droppingPoint: `${to} counter`,
          fare: Math.round((base + rand() * 900) / 10) * 10,
          seatsAvailable: Math.floor(rand() * 36),
          bookingUrl,
          demo: true,
        };
      });
    },
  };
}
