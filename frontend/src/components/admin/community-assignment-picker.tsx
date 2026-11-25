"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";
import {
  communityHasAssignedAdmin,
  type AdminCommunity,
} from "@/lib/api/communities";

type CommunityAssignmentPickerProps = {
  regionSelected: boolean;
  loading: boolean;
  communities: AdminCommunity[];
  selectedCommunityId: number | "";
  addingNew: boolean;
  error?: string;
  autoOpenToken?: number | "";
  onSelectExisting: (community: AdminCommunity) => void;
  onAddNew: () => void;
};

export function CommunityAssignmentPicker({
  regionSelected,
  loading,
  communities,
  selectedCommunityId,
  addingNew,
  error,
  autoOpenToken,
  onSelectExisting,
  onAddNew,
}: CommunityAssignmentPickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { style: popoverStyle } = useAnchoredPopover(open, triggerRef, {
    popoverRef,
    align: "left",
    constrainToViewport: true,
    preferBelow: true,
    maxHeight: 220,
  });

  const selected = communities.find((community) => community.id === selectedCommunityId);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!regionSelected || !autoOpenToken) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [autoOpenToken, regionSelected]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const placeholder = !regionSelected
    ? "Select a region first"
    : loading
      ? "Loading communities…"
      : "Select a community";

  const triggerLabel = addingNew
    ? "Add new community"
    : selected?.name ?? placeholder;

  return (
    <div className="nl-notice-field min-w-0 w-full" ref={wrapRef}>
      <div className="nl-picker-wrap min-w-0 w-full">
        <button
          ref={triggerRef}
          type="button"
          data-field="community_id"
          title={selected?.name ?? (addingNew ? "Add new community" : undefined)}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={!regionSelected}
          onClick={() => regionSelected && setOpen((value) => !value)}
          className={[
            "nl-picker-trigger",
            selected || addingNew ? "has-value" : "",
            error ? "border-red-300 ring-1 ring-red-100" : "",
            open ? "nl-picker-trigger-open" : "",
            !regionSelected ? "cursor-not-allowed bg-slate-50" : "",
          ].join(" ")}
        >
          <span
            className={[
              "nl-picker-text flex-1",
              selected || addingNew ? "" : "is-placeholder",
            ].join(" ")}
          >
            {triggerLabel}
          </span>
          <ChevronDown
            className={`nl-picker-chevron ${open ? "nl-picker-chevron-open" : ""}`}
            size={14}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {open && mounted
          ? createPortal(
              <div
                ref={popoverRef}
                className="nl-themed-popover nl-select-popover !overflow-hidden flex flex-col"
                style={popoverStyle}
                role="listbox"
              >
                <button
                  type="button"
                  onClick={() => {
                    onAddNew();
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-[#1B4F8A] transition hover:bg-[#F4F8FC]",
                    addingNew ? "bg-[#F4F8FC]" : "",
                  ].join(" ")}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#E8F0F7]">
                    <Plus size={13} strokeWidth={2.5} aria-hidden />
                  </span>
                  Add new community
                  {addingNew ? <Check size={14} strokeWidth={2.5} className="ml-auto" aria-hidden /> : null}
                </button>

                <div className="my-1.5 h-px shrink-0 bg-slate-100" />

                {loading ? (
                  <p className="px-2.5 py-3 text-[13px] text-slate-500">Loading communities…</p>
                ) : communities.length === 0 ? (
                  <p className="px-2.5 py-3 text-[13px] text-slate-500">
                    No communities in this region yet.
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
                    {communities.map((community) => {
                      const assigned = communityHasAssignedAdmin(community);
                      const active = community.id === selectedCommunityId && !addingNew;
                      return (
                        <button
                          key={community.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          disabled={assigned}
                          onClick={() => {
                            if (assigned) return;
                            onSelectExisting(community);
                            setOpen(false);
                          }}
                          className={[
                            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition",
                            assigned
                              ? "cursor-not-allowed bg-slate-50/80"
                              : active
                                ? "bg-[#E8F0F7]"
                                : "hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className={[
                                "block truncate text-[13px] font-semibold",
                                assigned ? "text-slate-400" : "text-slate-800",
                              ].join(" ")}
                            >
                              {community.name}
                            </span>
                          </span>
                          <StatusBadge assigned={assigned} />
                          {active ? (
                            <Check size={14} strokeWidth={2.5} className="shrink-0 text-[#1B4F8A]" aria-hidden />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}

function StatusBadge({ assigned }: { assigned: boolean }) {
  return (
    <span
      className={[
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        assigned ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {assigned ? "Assigned" : "Available"}
    </span>
  );
}
