function parseTimeMinutes(time) {
  const trimmed = String(time ?? "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export function resolveEffectiveEndDate(startDate, endDate) {
  const start = String(startDate ?? "").trim().slice(0, 10);
  const end = String(endDate ?? "").trim().slice(0, 10);
  return end || start;
}

export function isScheduleEndBeforeStart(startDate, startTime, endDate, endTime) {
  const startDay = String(startDate ?? "").trim().slice(0, 10);
  const endDay = resolveEffectiveEndDate(startDate, endDate);
  if (!startDay || !endDay) return false;
  if (endDay < startDay) return true;
  if (endDay > startDay) return false;
  const startMin = parseTimeMinutes(startTime);
  const endMin = parseTimeMinutes(endTime);
  if (startMin == null || endMin == null) return false;
  return endMin <= startMin;
}
