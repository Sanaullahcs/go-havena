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

function mapsQuery({ name, address, communityName, latitude, longitude }) {
  const labeled = [name, address || communityName].filter(Boolean).join(", ");
  if (labeled) return labeled;
  if (Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
    return `${Number(latitude)},${Number(longitude)}`;
  }
  return "";
}

export function mapsDirectionsUrl(place) {
  const query = mapsQuery(place);
  if (!query) return null;
  const encoded = encodeURIComponent(query);
  if (Platform.OS === "ios") {
    return `http://maps.apple.com/?daddr=${encoded}&dirflg=d`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}

export async function openPlaceDirections(place) {
  const url = mapsDirectionsUrl(place);
  if (!url) {
    const error = new Error("no-location");
    error.code = "no-location";
    throw error;
  }
  await Linking.openURL(url);
}
