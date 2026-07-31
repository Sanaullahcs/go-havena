/** Parse display hours like "6:00 AM – 10:00 PM" into 24h HH:mm values. */
export function parseHoursRange(str: string): { open: string; close: string } {
  const empty = { open: "", close: "" };
  if (!str?.trim()) return empty;

  const parts = str.split(/\s*[–-]\s*/);
  if (parts.length < 2) return empty;

  return {
    open: displayTimeTo24h(parts[0].trim()),
    close: displayTimeTo24h(parts[1].trim()),
  };
}

export function displayTimeTo24h(str: string): string {
  const match = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return "";

  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function formatHoursRange(open: string, close: string): string {
  if (!open || !close) return "";
  return `${formatTimeDisplay(open)} - ${formatTimeDisplay(close)}`;
}

export function formatTimeDisplay(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${m} ${suffix}`;
}
