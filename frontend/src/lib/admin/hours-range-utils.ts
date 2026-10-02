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

export const OPEN_24_HOURS_LABEL = "Open 24 Hours";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatHoursRange(open: string, close: string): string {
  if (!open || !close) return "";
  return `${formatTimeDisplay(open)} - ${formatTimeDisplay(close)}`;
}

export function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatScheduleDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function parseScheduleDate(label: string): string {
  const match = label.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/);
  if (!match) return "";
  const month = MONTHS.indexOf(match[1]) + 1;
  if (!month) return "";
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
}

/** Same calendar day when either date is still unset. */
export function isSameScheduleDay(openingDate: string, closingDate: string): boolean {
  return !openingDate || !closingDate || openingDate === closingDate;
}

export function isNextScheduleDay(openingDate: string, closingDate: string): boolean {
  return Boolean(openingDate && closingDate && addIsoDays(openingDate, 1) === closingDate);
}

export function clockMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function buildScheduleHours(
  open: string,
  close: string,
  openingDate: string,
  closingDate: string,
): string {
  if (!open || !close) return "";
  if (openingDate && closingDate && openingDate !== closingDate) {
    return `${formatScheduleDate(openingDate)}, ${formatTimeDisplay(open)} - ${formatScheduleDate(closingDate)}, ${formatTimeDisplay(close)}`;
  }
  return formatHoursRange(open, close);
}

export function parseStoredSchedule(hours: string): {
  open24Hours: boolean;
  openingDate: string;
  closingDate: string;
} {
  if (hours.trim() === OPEN_24_HOURS_LABEL) {
    return { open24Hours: true, openingDate: "", closingDate: "" };
  }
  const match = hours.match(
    /^([A-Z][a-z]{2} \d{1,2}, \d{4}), \d{1,2}:\d{2} [AP]M - ([A-Z][a-z]{2} \d{1,2}, \d{4}), \d{1,2}:\d{2} [AP]M$/,
  );
  if (!match) return { open24Hours: false, openingDate: "", closingDate: "" };
  return {
    open24Hours: false,
    openingDate: parseScheduleDate(match[1]),
    closingDate: parseScheduleDate(match[2]),
  };
}

export function formatTimeDisplay(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${m} ${suffix}`;
}
