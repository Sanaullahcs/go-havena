"use client";

import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

export type PopoverPlacement = "bottom-end" | "bottom-start" | "top-end" | "top-start";

const POPOVER_Z_INDEX = 400;

type AnchoredPopoverOptions = {
  popoverRef?: RefObject<HTMLElement | null>;
  width?: number;
  align?: "left" | "right";
  gap?: number;
  zIndex?: number;
  constrainToViewport?: boolean;
  constrainToBoundary?: boolean;
  preferBelow?: boolean;
  maxHeight?: number;
};

export type AnchoredPopoverResult = {
  style: CSSProperties;
  ready: boolean;
  placement: PopoverPlacement;
};

const HIDDEN_STYLE: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  opacity: 0,
  pointerEvents: "none",
  visibility: "hidden",
  zIndex: POPOVER_Z_INDEX,
};

export function useAnchoredPopover(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  options?: AnchoredPopoverOptions,
): AnchoredPopoverResult {
  const [result, setResult] = useState<AnchoredPopoverResult>({
    style: HIDDEN_STYLE,
    ready: false,
    placement: "bottom-end",
  });

  useLayoutEffect(() => {
    if (!open) {
      setResult({ style: HIDDEN_STYLE, ready: false, placement: "bottom-end" });
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const width = options?.width ?? Math.max(rect.width, 160);
      const gap = options?.gap ?? 6;
      const zIndex = options?.zIndex ?? POPOVER_Z_INDEX;
      const viewportPadding = 12;
      const alignEnd = options?.align !== "left";

      let left = alignEnd ? rect.right - width : rect.left;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - width - viewportPadding));

      const measuredHeight =
        options?.popoverRef?.current?.offsetHeight ??
        options?.popoverRef?.current?.getBoundingClientRect().height ??
        0;
      const menuHeight = measuredHeight > 0 ? measuredHeight : 160;

      const boundary = options?.constrainToBoundary
        ? anchor.closest("[data-popover-boundary]")?.getBoundingClientRect()
        : null;
      const bottomLimit = (boundary?.bottom ?? window.innerHeight) - viewportPadding;
      const topLimit = (boundary?.top ?? 0) + viewportPadding;
      const spaceBelow = bottomLimit - rect.bottom;
      const spaceAbove = rect.top - topLimit;
      const preferredMax = options?.maxHeight ?? 256;
      const minMenu = Math.min(140, preferredMax);
      const openBelow = options?.preferBelow
        ? spaceBelow >= Math.min(120, preferredMax) || spaceBelow >= spaceAbove
        : spaceBelow >= Math.min(menuHeight, preferredMax) || spaceBelow >= spaceAbove;

      const available = Math.max(minMenu, (openBelow ? spaceBelow : spaceAbove) - gap);
      const maxHeight = options?.constrainToViewport
        ? Math.min(preferredMax, available)
        : options?.maxHeight;

      const usedHeight = maxHeight ? Math.min(menuHeight || preferredMax, maxHeight) : menuHeight;

      const top = openBelow
        ? rect.bottom + gap
        : Math.max(viewportPadding, rect.top - usedHeight - gap);

      const placement: PopoverPlacement = openBelow
        ? alignEnd
          ? "bottom-end"
          : "bottom-start"
        : alignEnd
          ? "top-end"
          : "top-start";

      const transformOrigin =
        placement === "bottom-end"
          ? "top right"
          : placement === "bottom-start"
            ? "top left"
            : placement === "top-end"
              ? "bottom right"
              : "bottom left";

      setResult({
        ready: true,
        placement,
        style: {
          position: "fixed",
          top,
          left,
          width,
          zIndex,
          maxHeight,
          opacity: 1,
          pointerEvents: "auto",
          visibility: "visible",
          transformOrigin,
        },
      });
    };

    let resizeObserver: ResizeObserver | null = null;

    update();
    const raf = requestAnimationFrame(() => {
      update();
      const el = options?.popoverRef?.current;
      if (el && typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(el);
      }
    });

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      resizeObserver?.disconnect();
    };
  }, [
    open,
    anchorRef,
    options?.popoverRef,
    options?.width,
    options?.align,
    options?.gap,
    options?.zIndex,
    options?.constrainToViewport,
    options?.constrainToBoundary,
    options?.preferBelow,
    options?.maxHeight,
  ]);

  return result;
}
