"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PHONE_COUNTRIES,
  formatDialLabel,
  getCountryByCode,
} from "@/lib/phone/countries";
import {
  buildPhoneField,
  extractNationalDigits,
  formatNationalDisplay,
  formatPhoneDisplay,
  getPhonePlaceholder,
  getPhoneProgressHint,
  getPhoneValidationError,
  isPhoneEntryIncomplete,
  parsePhoneInputChange,
  phoneFieldFromE164,
  type PhoneFieldState,
} from "@/lib/phone/format";

export type AdminPhoneInputProps = {
  id?: string;
  value?: string;
  onChange?: (state: PhoneFieldState) => void;
  onBlur?: () => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  showError?: boolean;
  resetKey?: string | number;
  hint?: string;
};

export function AdminPhoneInput({
  id,
  value = "",
  onChange,
  onBlur,
  required = false,
  disabled = false,
  className = "",
  showError = false,
  resetKey = "",
  hint,
}: AdminPhoneInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const listId = `${inputId}-countries`;
  const countryRootRef = useRef<HTMLDivElement>(null);
  const countryListRef = useRef<HTMLDivElement>(null);
  const [countryListBox, setCountryListBox] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const [field, setField] = useState<PhoneFieldState>(() => phoneFieldFromE164(value));
  const [touched, setTouched] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const appliedResetKey = useRef(resetKey);

  useEffect(() => {
    // An invalid or in-progress number has an empty E.164. Only a new resetKey
    // may clear the digits and return the country to the default.
    if (appliedResetKey.current !== resetKey) {
      appliedResetKey.current = resetKey;
      setField(phoneFieldFromE164(value));
      setTouched(false);
      return;
    }
    if (!value) return;
    setField((current) => (current.e164 === value ? current : phoneFieldFromE164(value)));
  }, [value, resetKey]);

  useEffect(() => {
    if (!countryOpen) {
      setCountryQuery("");
      setCountryListBox(null);
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (countryRootRef.current?.contains(target) || countryListRef.current?.contains(target)) return;
      setCountryOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCountryOpen(false);
    };

    const fitList = () => {
      const root = countryRootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const upward = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(288, (upward ? spaceAbove : spaceBelow) - 12));
      const width = Math.min(296, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setCountryListBox({
        left,
        width,
        maxHeight,
        ...(upward
          ? { bottom: Math.max(8, window.innerHeight - rect.top + 6) }
          : { top: rect.bottom + 6 }),
      });
    };

    fitList();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", fitList, true);
    window.addEventListener("resize", fitList);
    window.visualViewport?.addEventListener("resize", fitList);
    window.visualViewport?.addEventListener("scroll", fitList);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", fitList, true);
      window.removeEventListener("resize", fitList);
      window.visualViewport?.removeEventListener("resize", fitList);
      window.visualViewport?.removeEventListener("scroll", fitList);
    };
  }, [countryOpen]);

  const display = formatNationalDisplay(field.digits, field.country);
  const formatError = getPhoneValidationError(field.digits, field.country);
  const requiredError =
    required && !field.digits.trim() ? "Phone number is required." : null;
  const validationError = formatError ?? requiredError;
  const progressHint = getPhoneProgressHint(field.digits, field.country);
  const selected = getCountryByCode(field.country);
  const dial = formatDialLabel(field.country);
  const placeholder = getPhonePlaceholder(field.country);
  const incomplete = isPhoneEntryIncomplete(field.digits, field.country);
  const showValidation = Boolean(validationError && (!incomplete || showError || touched));

  const updateField = (nextCountry: string, nextDigits: string) => {
    const next = buildPhoneField(nextCountry, nextDigits);
    setField(next);
    onChange?.(next);
  };

  const helperText = showValidation
    ? validationError
    : field.valid && field.e164
      ? `Saved as ${formatPhoneDisplay(field.e164)}`
      : progressHint
        ?? hint
        ?? (field.country === "US" || field.country === "CA"
          ? "Enter your 10-digit number — country code is already selected."
          : `Enter your ${selected.name} number without the country code.`);

  const handleInputChange = (text: string) => {
    updateField(
      field.country,
      parsePhoneInputChange(text, field.country, field.digits),
    );
  };

  const selectCountry = (code: string) => {
    setTouched(true);
    updateField(code, extractNationalDigits(field.digits, code));
    setCountryQuery("");
    setCountryOpen(false);
  };

  const countryQueryNormalized = countryQuery.trim().toLowerCase();
  const visibleCountries = PHONE_COUNTRIES.filter((item) => {
    if (!countryQueryNormalized) return true;
    const dialLabel = formatDialLabel(item.code).toLowerCase();
    const digits = dialLabel.replace(/\D/g, "");
    const queryDigits = countryQueryNormalized.replace(/\D/g, "");
    return (
      item.name.toLowerCase().includes(countryQueryNormalized)
      || dialLabel.includes(countryQueryNormalized)
      || (queryDigits.length > 0 && digits.includes(queryDigits))
    );
  });

  return (
    <div className={className}>
      <div
        className={[
          "flex rounded-xl border bg-white shadow-sm transition-all",
          countryOpen ? "overflow-visible" : "overflow-hidden",
          showValidation
            ? "border-red-300 ring-2 ring-red-100"
            : field.valid
              ? "border-emerald-300 ring-2 ring-emerald-50"
              : "border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100",
          disabled ? "opacity-60" : "",
        ].join(" ")}
      >
        <div
          ref={countryRootRef}
          className="relative shrink-0 border-r border-slate-200 bg-slate-50/90"
        >
          <button
            type="button"
            disabled={disabled}
            aria-label={`Country — ${selected.name} ${dial}`}
            aria-haspopup="listbox"
            aria-expanded={countryOpen}
            aria-controls={listId}
            onClick={() => {
              if (disabled) return;
              setCountryOpen((open) => !open);
            }}
            className={[
              "flex h-11 min-w-[6.25rem] items-center gap-1.5 pl-3.5 pr-8 text-left outline-none transition-colors",
              "hover:bg-slate-100/80 focus-visible:bg-slate-100/80",
              countryOpen ? "bg-slate-100" : "",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {field.country}
            </span>
            <span className="text-sm font-semibold tabular-nums text-slate-800">{dial}</span>
          </button>

          <svg
            className={[
              "pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform duration-200",
              countryOpen ? "rotate-180" : "",
            ].join(" ")}
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>

          {countryOpen && countryListBox
            ? createPortal(
            <div
              ref={countryListRef}
              id={listId}
              role="listbox"
              aria-label="Select country code"
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
              style={{
                position: "fixed",
                zIndex: 400,
                left: countryListBox.left,
                width: countryListBox.width,
                maxHeight: countryListBox.maxHeight,
                top: countryListBox.top,
                bottom: countryListBox.bottom,
              }}
            >
              <label className="relative block shrink-0 border-b border-slate-100 p-2">
                <span className="sr-only">Search country or code</span>
                <svg
                  className="pointer-events-none absolute left-[1.15rem] top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden
                >
                  <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M13.2 13.2L16.5 16.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <ClearableInput
                  type="search"
                  value={countryQuery}
                  onChange={(event) => setCountryQuery(event.target.value)}
                  placeholder="Search country or code"
                  aria-label="Search country or code"
                  autoComplete="off"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 py-0 pl-9 pr-9 text-sm text-slate-900 outline-none placeholder:text-slate-400 [appearance:textfield] [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
                />
              </label>
              <div className="min-h-0 flex-1 overflow-auto overscroll-contain py-1.5">
                {visibleCountries.length === 0 ? (
                  <p className="px-3.5 py-6 text-center text-[13px] text-slate-500">No country found.</p>
                ) : null}
                {visibleCountries.map((item) => {
                  const itemDial = formatDialLabel(item.code);
                  const active = item.code === field.country;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCountry(item.code)}
                      className={[
                        "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                        active
                          ? "bg-blue-50 text-blue-700"
                          : "text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-flex min-w-[2.1rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                          active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500",
                        ].join(" ")}
                      >
                        {item.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {item.name}
                      </span>
                      <span
                        className={[
                          "shrink-0 text-[13px] font-semibold tabular-nums",
                          active ? "text-blue-700" : "text-slate-500",
                        ].join(" ")}
                      >
                        {itemDial}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          ) : null}
        </div>

        <div className="relative flex min-w-0 flex-1 items-center overflow-hidden rounded-r-xl">
          <ClearableInput
            id={inputId}
            type="text"
            inputMode="tel"
            autoComplete="tel-national"
            required={required}
            disabled={disabled}
            value={display}
            placeholder={placeholder}
            aria-invalid={showValidation ? true : undefined}
            aria-describedby={hintId}
            onBlur={(e) => {
              setTouched(true);
              handleInputChange(e.currentTarget.value);
              onBlur?.();
            }}
            onChange={(e) => handleInputChange(e.target.value)}
            className="nl-phone-national-input h-11 w-full min-w-0 border-0 bg-transparent px-3.5 text-[15px] font-medium tabular-nums tracking-wide text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
          />
          {field.valid ? (
            <span
              className="mr-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
              title="Valid phone number"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
          ) : field.digits && incomplete && !showValidation ? (
            <span className="mr-3 h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Incomplete number" />
          ) : null}
        </div>
      </div>

      <p
        id={hintId}
        className={[
          "mt-1.5 text-[12px] leading-relaxed",
          showValidation ? "font-medium text-red-600" : field.valid ? "text-emerald-700" : "text-slate-500",
        ].join(" ")}
      >
        {helperText}
      </p>
    </div>
  );
}

export function isPhoneValueValid(value: string): boolean {
  return phoneFieldFromE164(value).valid;
}
