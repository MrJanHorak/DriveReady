// Decode OSRM's precision-5 polyline with bounded work for untrusted input.
export function decodeRoutePolyline(encoded) {
  if (typeof encoded !== "string" || encoded.length < 2 || encoded.length > 12000) throw new Error("Invalid route line.");
  let index = 0, latitude = 0, longitude = 0;
  const points = [];
  function readDelta() {
    let value = 0, shift = 0;
    while (true) {
      if (index >= encoded.length || shift > 25) throw new Error("Invalid route line.");
      const part = encoded.charCodeAt(index++) - 63;
      if (part < 0 || part > 63) throw new Error("Invalid route line.");
      value += (part & 31) * 2 ** shift;
      if (part < 32) return value % 2 ? -(Math.floor(value / 2) + 1) : value / 2;
      shift += 5;
    }
  }
  while (index < encoded.length) {
    latitude += readDelta(); longitude += readDelta();
    const lat = latitude / 100000, lng = longitude / 100000;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) throw new Error("Invalid route line.");
    points.push({ lat, lng });
    if (points.length > 3000) throw new Error("Route line is too long.");
  }
  if (points.length < 2 || points.every((point) => point.lat === points[0].lat && point.lng === points[0].lng)) throw new Error("Invalid route line.");
  return points;
}
