"use client";

import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { getCountryFlag } from "@/lib/phone/countries";
import { formatPhoneDisplay, normalizePhoneE164 } from "@/lib/phone/format";

export function PhoneDisplay({
  value,
  compact = false,
  className = "",
}: {
  value?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const raw = String(value ?? "").trim();
  if (!raw || (raw.includes("@") && !raw.includes("@phone.nbrlink.local"))) {
    return <span className={`text-slate-400 ${className}`.trim()}>—</span>;
  }

  const e164 = normalizePhoneE164(raw) || raw;
  const parsed = parsePhoneNumberFromString(e164.startsWith("+") ? e164 : raw);
  const country = parsed?.country ?? (e164.startsWith("+1") ? "US" : "");
  const formatted = formatPhoneDisplay(raw);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium tabular-nums tracking-tight text-slate-700 ${className}`.trim()}
        title={formatted}
      >
        {country ? (
          <span className="text-sm leading-none" aria-hidden>
            {getCountryFlag(country)}
          </span>
        ) : null}
        <span>{formatted}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 text-[13px] font-medium tabular-nums tracking-tight text-slate-700 ${className}`.trim()}
      title={formatted}
    >
      {country ? (
        <span className="text-base leading-none" aria-hidden>
          {getCountryFlag(country)}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{formatted}</span>
    </span>
  );
}
