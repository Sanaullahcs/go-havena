import { useCallback, useRef, useState } from "react";

/** Prevents duplicate API calls from rapid button taps (ref lock + disabled UI state). */
export function useSubmitLock() {
  const [submitting, setSubmitting] = useState(false);
  const lockRef = useRef(false);

  const run = useCallback(async (fn) => {
    if (lockRef.current) return null;
    lockRef.current = true;
    setSubmitting(true);
    try {
      return await fn();
    } finally {
      lockRef.current = false;
      setSubmitting(false);
    }
  }, []);

  return { submitting, run };
}

export function normalizeDateInput(value) {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return trimmed;
}

export function normalizeTimeInput(value) {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return trimmed;
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = match[4]?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}
