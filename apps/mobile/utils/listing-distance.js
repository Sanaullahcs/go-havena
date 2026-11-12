export function metersBetween(fromLat, fromLng, toLat, toLng) {
  const lat1 = Number(fromLat);
  const lng1 = Number(fromLng);
  const lat2 = Number(toLat);
  const lng2 = Number(toLng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (value) => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function drivingMinutesFromMeters(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.round(value / 500));
}

export function withUserDistance(place, origin) {
  if (!place || !origin) return place;
  const meters = metersBetween(origin.latitude, origin.longitude, place.latitude, place.longitude);
  if (meters == null) return place;
  return {
    ...place,
    distanceMeters: meters,
    distanceKm: Math.round((meters / 1000) * 100) / 100,
  };
}
