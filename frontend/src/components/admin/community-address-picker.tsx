"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { reverseAddress, suggestAddress, type AddressSuggestion } from "@/lib/api/geo";

const MAP_HEIGHT = 300;

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
  placeholder = "Search a street address",
  inputClassName,
  id,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(value.address);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const skipSuggest = useRef(true);
  const typingRef = useRef(false);
  const reverseTimer = useRef<number | null>(null);
  const reverseSeq = useRef(0);
  const valueRef = useRef(value);
  const queryRef = useRef(query);
  valueRef.current = value;
  queryRef.current = query;

  useEffect(() => {
    if (value.address === queryRef.current) return;
    skipSuggest.current = true;
    typingRef.current = false;
    setQuery(value.address);
    setOpen(false);
    setSuggestions([]);
  }, [value.address]);

  useEffect(() => {
    if (skipSuggest.current || !typingRef.current) {
      skipSuggest.current = false;
      return;
    }

    const term = query.trim();
    if (term.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const handle = window.setTimeout(() => {
      setLoading(true);
      suggestAddress(term)
        .then((rows) => {
          setSuggestions(rows);
          setOpen(rows.length > 0);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
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

  const pick = (row: AddressSuggestion) => {
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
  };

  return (
    <div ref={rootRef} className="relative space-y-2.5">
      <input
        id={id}
        value={query}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        required={required}
        placeholder={placeholder}
        className={inputClassName}
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
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={onBlur}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.map((row) => (
            <li key={`${row.latitude}-${row.longitude}-${row.label}`}>
              <button
                type="button"
                role="option"
                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(row)}
              >
                {row.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {loading ? <p className="text-[13px] leading-5 text-slate-400">Searching addresses…</p> : null}
      {hasPin ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_32px_rgba(11,31,58,0.08)] ring-1 ring-slate-900/5">
          <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#0b1f3a] via-[#1B4F8A] to-[#0d9488] px-3.5 py-2.5 text-white">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-200">
                Community pin
              </p>
              <p className="truncate text-[12px] font-medium text-white/90">
                {resolvingAddress ? "Updating address…" : "Drag or tap to update the address"}
              </p>
            </div>
            <p className="shrink-0 rounded-full bg-white/12 px-2.5 py-1 font-mono text-[10px] tabular-nums text-white/90 ring-1 ring-white/15">
              {formatCoord(value.latitude as number)}, {formatCoord(value.longitude as number)}
            </p>
          </div>
          <CommunityAddressMap
            latitude={value.latitude as number}
            longitude={value.longitude as number}
            onMove={applyPinMove}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3.5">
          <p className="text-[13px] leading-6 text-slate-600">
            Type the community street address, then choose a suggestion from the list. A pin will appear on the map.
          </p>
        </div>
      )}
    </div>
  );
}
