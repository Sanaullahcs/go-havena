"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ThemedDatePicker } from "@/components/ui/themed-date-picker";
import { ThemedSelect } from "@/components/ui/themed-select";

export type ContentBoardSort = "relevant" | "newest" | "oldest" | "schedule";

const SORT_OPTIONS: { value: ContentBoardSort; label: string }[] = [
  { value: "relevant", label: "Suggested" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "schedule", label: "By date" },
];

type Props = {
  open: boolean;
  sort: ContentBoardSort;
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
  onApply: (next: { sort: ContentBoardSort; dateFrom: string; dateTo: string }) => void;
};

export function ContentBoardFilterDialog({
  open,
  sort,
  dateFrom,
  dateTo,
  onClose,
  onApply,
}: Props) {
  const [draftSort, setDraftSort] = useState<ContentBoardSort>(sort);
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);

  useEffect(() => {
    if (!open) return;
    setDraftSort(sort);
    setDraftFrom(dateFrom);
    setDraftTo(dateTo);
  }, [open, sort, dateFrom, dateTo]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Let open date/select popovers handle Escape first.
      if (document.querySelector(".nl-themed-popover")) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleClear = () => {
    setDraftSort("relevant");
    setDraftFrom("");
    setDraftTo("");
  };

  const handleApply = () => {
    let from = draftFrom;
    let to = draftTo;
    if (from && to && from > to) {
      from = draftTo;
      to = draftFrom;
    }
    onApply({ sort: draftSort, dateFrom: from, dateTo: to });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close filters"
        className="absolute inset-0 nl-modal-backdrop bg-slate-900/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-board-filter-title"
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="content-board-filter-title" className="text-lg font-bold text-slate-900">
              Filters
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Sort and narrow results by date range.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <ThemedSelect
            label="Sort"
            value={draftSort}
            onChange={(value) => setDraftSort(value as ContentBoardSort)}
            options={SORT_OPTIONS}
            placeholder="Select sort"
          />
          <ThemedDatePicker
            label="From"
            value={draftFrom}
            onChange={setDraftFrom}
            placeholder="Select start date"
            max={draftTo || undefined}
          />
          <ThemedDatePicker
            label="To"
            value={draftTo}
            onChange={setDraftTo}
            placeholder="Select end date"
            min={draftFrom || undefined}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            Clear all
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="nl-btn-primary rounded-xl px-4 py-2 text-sm"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
