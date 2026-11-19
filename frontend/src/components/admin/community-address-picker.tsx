"use client";

import { ClearableInput } from "@/components/admin/clearable-field";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Loader2, MapPin } from "lucide-react";
import { geocodeAddress, reverseAddress, suggestAddress, type AddressSuggestion } from "@/lib/api/geo";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";

const MAP_HEIGHT = 300;
const COMPACT_MAP_HEIGHT = 180;

const CommunityAddressMap = dynamic(
  () => import("./community-address-map").then((mod) => mod.CommunityAddressMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex w-full items-center justify-center bg-gradient-to-br from-slate-100 via-teal-50 to-sky-100"
        style={{ height: MAP_HEIGHT }}
      >
        <span className="text-xs font-medium text-slate-500">Loading map…</span>
      </div>
    ),
  },
);

export type CommunityAddressValue = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  value: CommunityAddressValue;
  onChange: (next: CommunityAddressValue) => void;
  onBlur?: () => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  inputClassName?: string;
  id?: string;
  /** Shorter field for dialogs: icon, suggestion menu, and a smaller map. */
  compact?: boolean;
  /** Local essentials: keep the typed address; suggestions only set the map pin. */
  preserveUserAddress?: boolean;
};

function formatCoord(value: number) {
  return value.toFixed(5);
}

export function CommunityAddressPicker({
  value,
  onChange,
  onBlur,
  error,
  required,
  placeholder = "Community address",
  inputClassName,
  id,
  compact = false,
  preserveUserAddress = false,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLUListElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState(value.address);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [geocodingTyped, setGeocodingTyped] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const skipSuggest = useRef(true);
  const typingRef = useRef(false);
  const reverseTimer = useRef<number | null>(null);
  const reverseSeq = useRef(0);
  const suggestSeq = useRef(0);
  const valueRef = useRef(value);
  const queryRef = useRef(query);
  valueRef.current = value;
  queryRef.current = query;

  const { style: popoverStyle, ready: popoverReady } = useAnchoredPopover(open, inputRef, {
    popoverRef,
    align: "left",
    constrainToViewport: true,
    preferBelow: true,
    maxHeight: 224,
    zIndex: compact ? 10000 : 400,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typingRef.current) return;
    const next = value.address ?? "";
    if (next === queryRef.current) return;
    skipSuggest.current = true;
    setQuery(next);
    setOpen(false);
    setSuggestions([]);
  }, [value.address, value.latitude, value.longitude]);

  useEffect(() => {
    if (skipSuggest.current) {
      skipSuggest.current = false;
      return;
    }

    const term = query.trim();
    if (term.length < 3) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      const seq = ++suggestSeq.current;
      setLoading(true);
      setOpen(true);
      setActiveIndex(0);
      suggestAddress(term, controller.signal)
        .then((rows) => {
          if (seq !== suggestSeq.current) return;
          setSuggestions(rows);
          setActiveIndex(0);
          setOpen(true);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (seq !== suggestSeq.current) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSuggestions([]);
          setOpen(true);
        })
        .finally(() => {
          if (seq === suggestSeq.current) setLoading(false);
        });
    }, 700);

    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  useEffect(() => {
    return () => {
      if (reverseTimer.current != null) window.clearTimeout(reverseTimer.current);
    };
  }, []);

  const cancelReverse = () => {
    reverseSeq.current += 1;
    if (reverseTimer.current != null) {
      window.clearTimeout(reverseTimer.current);
      reverseTimer.current = null;
    }
    setResolvingAddress(false);
  };

  const applyPinMove = (latitude: number, longitude: number) => {
    onChange({
      address: valueRef.current.address,
      latitude,
      longitude,
    });

    if (preserveUserAddress) {
      cancelReverse();
      return;
    }

    const seq = ++reverseSeq.current;
    setResolvingAddress(true);
    if (reverseTimer.current != null) window.clearTimeout(reverseTimer.current);
    reverseTimer.current = window.setTimeout(() => {
      reverseAddress(latitude, longitude)
        .then((row) => {
          if (seq !== reverseSeq.current || !row?.address) return;
          skipSuggest.current = true;
          typingRef.current = false;
          setQuery(row.address);
          onChange({
            address: row.address,
            latitude,
            longitude,
          });
        })
        .catch(() => {
          // Keep the pin; leave the last known address in place.
        })
        .finally(() => {
          if (seq === reverseSeq.current) setResolvingAddress(false);
        });
    }, 400);
  };

  const hasPin = value.latitude != null && value.longitude != null;
  const mapHeight = compact ? COMPACT_MAP_HEIGHT : MAP_HEIGHT;

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = suggestions[activeIndex] ?? suggestions[0];
      if (row) pick(row);
    }
  };

  const pinTypedAddress = () => {
    const term = query.trim();
    if (term.length < 3 || geocodingTyped) return;
    setGeocodingTyped(true);
    geocodeAddress(term)
      .then((row) => {
        if (!row) return;
        cancelReverse();
        skipSuggest.current = true;
        typingRef.current = false;
        setOpen(false);
        setSuggestions([]);
        setQuery(row.address);
        onChange({
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude,
        });
      })
      .finally(() => setGeocodingTyped(false));
  };

  const pick = (row: AddressSuggestion) => {
    cancelReverse();
    skipSuggest.current = true;
    typingRef.current = false;
    setOpen(false);
    setSuggestions([]);
    const storedAddress = (row.address || row.label || "").trim();
    setQuery(storedAddress);
    onChange({
      address: storedAddress,
      latitude: row.latitude,
      longitude: row.longitude,
    });
  };

  const showMenu = open && mounted && (loading || suggestions.length > 0 || query.trim().length >= 3);

  return (
    <div ref={rootRef} className="relative space-y-2">
      <div className="relative">
        {compact ? (
          <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#1B4F8A]" aria-hidden />
        ) : null}
        <ClearableInput
          ref={inputRef}
          id={id}
          value={query}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && suggestions[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
          required={required}
          placeholder={placeholder}
          className={[
            compact ? "nl-input box-border h-11 !py-0 !pl-9 outline-none focus:outline-none" : "",
            error ? "border-red-300 focus:border-red-400" : "",
            inputClassName ?? "",
          ].filter(Boolean).join(" ")}
          hideClear={loading}
          onKeyDown={onInputKeyDown}
          onChange={(event) => {
            const next = event.target.value;
            cancelReverse();
            typingRef.current = true;
            setQuery(next);
            onChange({
              address: next,
              latitude: next.trim() === value.address.trim() ? value.latitude : null,
              longitude: next.trim() === value.address.trim() ? value.longitude : null,
            });
          }}
          onFocus={() => {
            typingRef.current = true;
            if (suggestions.length > 0 || query.trim().length >= 3) setOpen(true);
          }}
          onBlur={() => {
            typingRef.current = false;
            onBlur?.();
          }}
        />
        {loading ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden />
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {showMenu
        ? createPortal(
            <ul
              ref={popoverRef}
              id={listId}
              role="listbox"
              className="nl-themed-popover overflow-x-hidden overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]"
              style={{
                ...popoverStyle,
                maxWidth: `min(${popoverStyle.width ?? "100vw"}, calc(100vw - 24px))`,
                visibility: popoverReady ? "visible" : "hidden",
                pointerEvents: popoverReady ? "auto" : "none",
              }}
            >
              {loading && suggestions.length === 0 ? (
                <li className="flex items-center gap-2 px-2.5 py-2.5 text-[13px] text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                  Searching addresses… This can take a few seconds.
                </li>
              ) : suggestions.length === 0 ? (
                <li className="px-2 py-2">
                  <p className="px-0.5 text-[13px] leading-5 text-slate-500">
                    No list match yet. Try adding city or area, or set the pin from your text.
                  </p>
                  <button
                    type="button"
                    className="mt-2 flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-slate-50"
                    disabled={geocodingTyped}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={pinTypedAddress}
                  >
                    {geocodingTyped ? (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[#1B4F8A]" aria-hidden />
                    ) : (
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1B4F8A]" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 break-words leading-5">
                      Use <span className="text-slate-900">“{query.trim()}”</span> on the map
                    </span>
                  </button>
                </li>
              ) : suggestions.map((row, index) => {
                const title = row.label || row.address;
                const detail = row.address && row.address !== title ? row.address : null;
                const active = index === activeIndex;
                return (
                  <li key={`${row.latitude}-${row.longitude}-${row.label}`}>
                    <button
                      id={`${listId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={[
                        "nl-select-option w-full items-start text-left",
                        active ? "nl-select-option-selected" : "",
                      ].join(" ")}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(row)}
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{title}</span>
                        {detail ? <span className="block truncate text-xs font-normal text-slate-500">{detail}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
      {hasPin ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_32px_rgba(11,31,58,0.08)] ring-1 ring-slate-900/5">
          <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#0b1f3a] via-[#1B4F8A] to-[#0d9488] px-3.5 py-2.5 text-white">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-200">
                {compact ? "Pinned address" : "Community pin"}
              </p>
              <p className="truncate text-[12px] font-medium text-white/90">
                {resolvingAddress ? "Updating address…" : "Drag or tap to adjust the pin"}
              </p>
            </div>
            <p className="shrink-0 rounded-full bg-white/12 px-2.5 py-1 font-mono text-[10px] tabular-nums text-white/90 ring-1 ring-white/15">
              {formatCoord(value.latitude as number)}, {formatCoord(value.longitude as number)}
            </p>
          </div>
          <CommunityAddressMap
            latitude={value.latitude as number}
            longitude={value.longitude as number}
            height={mapHeight}
            onMove={applyPinMove}
          />
        </div>
      ) : compact ? (
        error ? null : (
          <p className="text-[12px] leading-5 text-slate-400">
            {preserveUserAddress
              ? "Enter the community address, pick a suggestion or use your text to set the pin, then drag the pin if needed."
              : "Enter the community address and choose a suggestion. Distance is measured from the community."}
          </p>
        )
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3.5">
          <p className="text-[13px] leading-6 text-slate-600">
            Type the community address, choose a suggestion, or use your text to place the pin on the map.
          </p>
        </div>
      )}
    </div>
  );
}
