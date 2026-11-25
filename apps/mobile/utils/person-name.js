export function splitPersonName(displayName) {
  const trimmed = String(displayName ?? "").trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }
  const space = trimmed.indexOf(" ");
  if (space === -1) {
    return { firstName: trimmed, lastName: "" };
  }
  return {
    firstName: trimmed.slice(0, space).trim(),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

export function composePersonName(firstName, lastName) {
  return [String(firstName ?? "").trim(), String(lastName ?? "").trim()].filter(Boolean).join(" ");
}