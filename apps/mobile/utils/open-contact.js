import { Linking } from "react-native";

export function telUrl(phone) {
  const cleaned = String(phone ?? "").replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : "";
}

export function mapsUrl(address) {
  const query = String(address ?? "").trim();
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function extractHttpUrl(value) {
  const match = String(value ?? "").match(/https?:\/\/[^\s,]+/i);
  return match ? match[0].replace(/[)\].,;]+$/, "") : "";
}

export async function openExternalUrl(url, { showError, title, unsupported } = {}) {
  const target = String(url ?? "").trim();
  if (!target) return false;
  try {
    const supported = await Linking.canOpenURL(target);
    if (!supported) {
      if (showError) await showError(title, unsupported);
      return false;
    }
    await Linking.openURL(target);
    return true;
  } catch (err) {
    if (showError) await showError(title, err?.message ?? unsupported);
    return false;
  }
}
