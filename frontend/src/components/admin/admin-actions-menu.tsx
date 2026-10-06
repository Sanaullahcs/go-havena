"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import {
  AdminActionIcon,
  type AdminActionIconName,
  type AdminActionTone,
} from "@/components/admin/action-buttons";
import { useAnchoredPopover } from "@/components/ui/use-anchored-popover";

export type AdminMenuAction = {
  id?: string;
  label: string;
  icon?: AdminActionIconName;
  tone?: AdminActionTone;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  hidden?: boolean;
  title?: string;
};

const TONE_TEXT: Record<AdminActionTone, string> = {
  neutral: "text-slate-700 hover:bg-slate-50",
  primary: "text-blue-700 hover:bg-blue-50",
  success: "text-emerald-700 hover:bg-emerald-50",
  warning: "text-amber-700 hover:bg-amber-50",
  danger: "text-red-600 hover:bg-red-50",
};

export function AdminActionsMenu({
  actions,
  disabled,
  align = "right",
}: {
  actions: AdminMenuAction[];
  disabled?: boolean;
  align?: "left" | "right";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const visible = actions.filter((action) => !action.hidden);

  const { style: popoverStyle, placement, ready } = useAnchoredPopover(open, triggerRef, {
    popoverRef,
    width: 208,
    align,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (visible.length === 0) return null;

  const runAction = async (action: AdminMenuAction) => {
    setOpen(false);
    await action.onClick();
  };

  return (
    <div ref={wrapRef} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={[
          "flex h-8 w-8 items-center justify-center rounded-lg border bg-white text-[#64748B] transition-all duration-200",
          "hover:border-[#CBD5E1] hover:bg-[#F8FAFC] hover:text-[#334155] hover:shadow-sm",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open
            ? "border-[#CBD5E1] bg-[#F8FAFC] text-[#334155] shadow-sm ring-2 ring-blue-100"
            : "border-[#EDEDED]",
        ].join(" ")}
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>

      {open && mounted && ready
        ? createPortal(
            <div
              ref={popoverRef}
              className="nl-themed-popover nl-admin-menu-popover bg-white shadow-xl ring-1 ring-slate-200/80"
              data-placement={placement}
              style={{ ...popoverStyle, backgroundColor: "#ffffff", zIndex: 200 }}
              role="menu"
              aria-label="Actions"
            >
              {visible.map((action) => {
                const tone = action.tone ?? "neutral";
                const itemDisabled = Boolean(action.disabled || disabled);
                return (
                  <span key={action.id ?? action.label} title={action.title} className="block">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={itemDisabled}
                      title={action.title}
                      onClick={() => {
                        if (itemDisabled) return;
                        void runAction(action);
                      }}
                      className={[
                        "nl-admin-menu-item flex w-full items-center gap-2.5 rounded-lg bg-white px-3 py-2 text-left text-[13px] font-medium",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        TONE_TEXT[tone],
                      ].join(" ")}
                    >
                      {action.icon ? (
                        <AdminActionIcon icon={action.icon} className="h-4 w-4 shrink-0" />
                      ) : (
                        <span className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      <span className="truncate">{action.label}</span>
                    </button>
                  </span>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
