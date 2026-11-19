/** Display + storage text for a geocoder suggestion row. */
export function addressFromSuggestion(row) {
  if (!row || typeof row !== "object") return "";
  const label = String(row.label ?? "").trim();
  const address = String(row.address ?? "").trim();
  return address || label;
}
