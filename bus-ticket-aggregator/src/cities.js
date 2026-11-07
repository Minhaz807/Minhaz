// Canonical city list with the spelling variants different ticket sites use.
// The first alias is the display name; the rest are matched case-insensitively.
export const CITIES = [
  ['Dhaka'],
  ['Chattogram', 'Chittagong', 'Ctg'],
  ["Cox's Bazar", 'Coxs Bazar', 'Cox Bazar', 'Coxsbazar'],
  ['Sylhet'],
  ['Rajshahi'],
  ['Khulna'],
  ['Barishal', 'Barisal'],
  ['Rangpur'],
  ['Mymensingh'],
  ['Cumilla', 'Comilla'],
  ['Bogura', 'Bogra'],
  ['Jashore', 'Jessore'],
  ['Dinajpur'],
  ['Kushtia'],
  ['Feni'],
  ['Noakhali'],
  ['Bandarban'],
  ['Rangamati'],
  ['Khagrachari', 'Khagrachhari'],
  ['Teknaf'],
  ['Moulvibazar', 'Moulvi Bazar'],
  ['Sreemangal', 'Srimangal'],
  ['Kuakata'],
  ['Patuakhali'],
  ['Pabna'],
  ['Natore'],
  ['Chapainawabganj', 'Chapai Nawabganj'],
  ['Thakurgaon'],
  ['Panchagarh'],
  ['Saidpur'],
  ['Satkhira'],
  ['Benapole'],
  ['Gopalganj'],
  ['Faridpur'],
  ['Tangail'],
  ['Sirajganj'],
  ['Brahmanbaria'],
  ['Chandpur'],
  ['Lakshmipur'],
  ['Habiganj'],
  ['Sunamganj'],
  ['Kishoreganj'],
  ['Jamalpur'],
  ['Sherpur'],
  ['Netrokona'],
  ['Gaibandha'],
  ['Kurigram'],
  ['Lalmonirhat'],
  ['Nilphamari'],
  ['Joypurhat'],
  ['Naogaon'],
  ['Bagerhat'],
  ['Pirojpur'],
  ['Bhola'],
  ['Madaripur'],
  ['Shariatpur'],
  ['Magura'],
  ['Jhenaidah'],
  ['Chuadanga'],
  ['Meherpur'],
  ['Narail'],
];

export function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const aliasIndex = new Map();
for (const names of CITIES) {
  for (const n of names) aliasIndex.set(normalizeKey(n), names);
}

/** Returns every known spelling of a city (display name first). */
export function cityVariants(input) {
  const hit = aliasIndex.get(normalizeKey(input));
  return hit ? [...hit] : [String(input).trim()];
}

export function canonicalCity(input) {
  return cityVariants(input)[0];
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
