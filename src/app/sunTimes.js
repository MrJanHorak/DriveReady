// Sunrise and sunset, and how much of a time window falls outside daylight.
// The solar formulas follow SunCalc (Vladimir Agafonkin, BSD-2-Clause,
// https://github.com/mourner/suncalc), using the standard -0.833° sunrise/sunset
// altitude, with a ΔT correction. Within about a minute of reference values for
// everyday latitudes; the tests compare against an independent implementation.

const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, J0 = 0.0009;
const obliquity = rad * 23.4397, horizon = -0.833 * rad;

// The solar formulas run on Terrestrial Time, about 69 s ahead of UTC (ΔT, 2020s).
const deltaT = 69000;
const toJulian = (ms) => (ms + deltaT) / dayMs - 0.5 + J1970;
const fromJulian = (j) => (j + 0.5 - J1970) * dayMs - deltaT;
const toDays = (ms) => toJulian(ms) - J2000;
const declination = (l) => Math.asin(Math.sin(l) * Math.sin(obliquity));
const meanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}
const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (ht, lw, n) => J0 + (ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

/**
 * Sunrise and sunset (epoch ms) for solar day `n` at the given place, or a polar
 * flag when the sun stays up or down all day.
 */
function solarDay(n, lat, lng) {
  const lw = rad * -lng, phi = rad * lat;
  const ds = approxTransit(0, lw, n), M = meanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L);
  const noon = solarTransitJ(ds, M, L);
  const cosH = (Math.sin(horizon) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH > 1) return { polar: "night", noon: fromJulian(noon) };
  if (cosH < -1) return { polar: "day", noon: fromJulian(noon) };
  const set = solarTransitJ(approxTransit(Math.acos(cosH), lw, n), M, L);
  return { sunrise: fromJulian(noon - (set - noon)), sunset: fromJulian(set), noon: fromJulian(noon) };
}

/** Sunrise and sunset for the solar day nearest `ms` (epoch ms). */
export function sunTimes(ms, lat, lng) {
  return solarDay(julianCycle(toDays(ms), rad * -lng), lat, lng);
}

/**
 * Minutes of [startMs, endMs] after sunset or before sunrise at (lat, lng),
 * rounded to the nearest minute.
 */
export function nightMinutes(startMs, endMs, lat, lng) {
  if (!(Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) return 0;
  const lw = rad * -lng;
  const first = julianCycle(toDays(startMs), lw) - 1, last = julianCycle(toDays(endMs), lw) + 1;
  let daylight = 0;
  for (let n = first; n <= last; n += 1) {
    const day = solarDay(n, lat, lng);
    // A polar "day" covers the whole solar day around its noon.
    const from = day.polar === "day" ? day.noon - dayMs / 2 : day.polar === "night" ? 0 : day.sunrise;
    const to = day.polar === "day" ? day.noon + dayMs / 2 : day.polar === "night" ? 0 : day.sunset;
    daylight += Math.max(0, Math.min(endMs, to) - Math.max(startMs, from));
  }
  return Math.max(0, Math.round((endMs - startMs - daylight) / 60000));
}

// Default location for the night suggestion when a drive has no mapped route:
// Augusta, Georgia, the pilot area.
export const PILOT_AREA = Object.freeze({ lat: 33.4735, lng: -82.0105, label: "the Augusta area" });
