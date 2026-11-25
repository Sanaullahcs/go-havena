import { Linking, Platform } from "react-native";

export function telUrl(phone) {
  const first = String(phone || "")
    .split(/[;|,/]/)[0]
    .trim();
  if (!first) return null;
  let digits = first.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  const count = (digits.match(/\d/g) || []).length;
  return count >= 7 ? `tel:${digits}` : null;
}

export async function callPlace(phone) {
  const url = telUrl(phone);
  if (!url) {
    const error = new Error("no-phone");
    error.code = "no-phone";
    throw error;
  }
  await Linking.openURL(url);
}

export function isPinnedCommunityPlace(place) {
  if (!place) return false;
  return (
    place.source === "community"
    || place.isCommunityEssential
    || String(place.id || "").startsWith("essential-")
  );
}

export function normalizePlaceLocation(place) {
  if (!place || typeof place !== "object") {
    return { name: "", address: "", communityName: "", latitude: null, longitude: null };
  }
  const address = String(
    place.address ?? place.formatted_address ?? place.formattedAddress ?? "",
  ).trim();
  const name = String(place.name ?? place.title ?? "").trim();
  const communityName = String(place.communityName ?? place.community_name ?? "").trim();
  const latitude = Number(place.latitude ?? place.lat);
  const longitude = Number(place.longitude ?? place.lng);

  return {
    name,
    address,
    communityName,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function formatCoordPair(latitude, longitude) {
  return `${latitude},${longitude}`;
}

/**
 * Maps navigation target — saved pin coordinates when present (Local Essentials).
 * Address text is for display in-app only; routing uses lat/lng.
 */
export function mapsDestinationQuery(place) {
  const { address, name, communityName, latitude, longitude } = normalizePlaceLocation(place);
  if (latitude != null && longitude != null) {
    return formatCoordPair(latitude, longitude);
  }
  if (isPinnedCommunityPlace(place)) return "";
  if (address) return address;
  const labeled = [name, communityName].filter(Boolean).join(", ");
  return labeled.trim();
}

function directionsUrls(place) {
  const { latitude, longitude, address, name, communityName } = normalizePlaceLocation(place);
  const pinned = isPinnedCommunityPlace(place);

  if (latitude != null && longitude != null) {
    const pair = formatCoordPair(latitude, longitude);
    if (Platform.OS === "android") {
      return [
        `google.navigation:q=${pair}`,
        `https://www.google.com/maps/dir/?api=1&destination=${pair}&travelmode=driving`,
        `geo:${latitude},${longitude}?q=${pair}`,
      ];
    }
    if (Platform.OS === "ios") {
      return [`http://maps.apple.com/?daddr=${pair}&dirflg=d`];
    }
    return [`https://www.google.com/maps/dir/?api=1&destination=${pair}&travelmode=driving`];
  }

  if (pinned) return [];

  const text = address || [name, communityName].filter(Boolean).join(", ").trim();
  if (!text) return [];

  const encoded = encodeURIComponent(text);
  if (Platform.OS === "ios") {
    return [`http://maps.apple.com/?daddr=${encoded}&dirflg=d`];
  }
  return [
    `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`,
    `geo:0,0?q=${encoded}`,
  ];
}

export function mapsDirectionsUrl(place) {
  const urls = directionsUrls(place);
  return urls[0] ?? null;
}

async function tryOpenUrl(url) {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function openPlaceDirections(place) {
  const urls = directionsUrls(place);
  if (!urls.length) {
    const error = new Error("no-location");
    error.code = "no-location";
    throw error;
  }

  for (const url of urls) {
    if (await tryOpenUrl(url)) return;
  }

  const error = new Error("no-location");
  error.code = "no-location";
  throw error;
}

export function mapsViewUrl(place) {
  const query = mapsDestinationQuery(place);
  if (!query) return null;
  const encoded = encodeURIComponent(query);
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}
