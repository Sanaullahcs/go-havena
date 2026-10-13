"use client";

import { useEffect } from "react";

const OVERLAY_SELECTOR = [
  ".nl-notice-modal-backdrop",
  ".swal2-container",
  "[aria-modal='true']",
  ".fixed.inset-0",
].join(", ");

function isShown(el: HTMLElement) {
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isScrollLockOverlay(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !isShown(el)) return false;
  if (el.classList.contains("swal2-container")) {
    return el.querySelector(".swal2-toast") == null;
  }
  if (el.classList.contains("nl-notice-modal-backdrop")) return true;
  if (el.classList.contains("fixed") && el.classList.contains("inset-0")) return true;
  if (el.getAttribute("aria-modal") === "true") {
    return Boolean(el.closest(".fixed.inset-0, .nl-notice-modal-backdrop, .swal2-container"));
  }
  return false;
}

function openOverlays() {
  return Array.from(document.querySelectorAll(OVERLAY_SELECTOR)).filter(isScrollLockOverlay);
}

function overlayFor(target: EventTarget | null) {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!el) return null;
  const match = el.closest(OVERLAY_SELECTOR);
  return match && isScrollLockOverlay(match) ? match : null;
}

function canScroll(el: HTMLElement, deltaY: number) {
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  if (deltaY < 0) return el.scrollTop > 0;
  return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
}

function scrollableFrom(target: EventTarget | null, deltaY: number) {
  const boundary = overlayFor(target);
  if (!boundary) return null;
  let node = target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay")
      && canScroll(node, deltaY)
    ) {
      return node;
    }
    if (node === boundary) break;
    node = node.parentElement;
  }
  return null;
}

function nearestModalScroller(target: EventTarget | null) {
  const boundary = overlayFor(target);
  if (!boundary) return null;
  let node = target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay")
      && node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    if (node === boundary) break;
    node = node.parentElement;
  }
  return null;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
}

/**
 * Keeps the page still while any dashboard modal is open, including nested dialogs.
 * The lock is released only after the last overlay closes, and the page returns to the same scroll position.
 */
export function ModalScrollLock() {
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    let locked = false;
    let scrollY = 0;
    const previous = {
      position: "",
      top: "",
      left: "",
      right: "",
      width: "",
      paddingRight: "",
    };

    const lock = () => {
      if (locked) return;
      scrollY = window.scrollY;
      const gap = Math.max(0, window.innerWidth - html.clientWidth);
      previous.position = body.style.position;
      previous.top = body.style.top;
      previous.left = body.style.left;
      previous.right = body.style.right;
      previous.width = body.style.width;
      previous.paddingRight = body.style.paddingRight;
      html.classList.add("nl-scroll-locked");
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      if (gap > 0) body.style.paddingRight = `${gap}px`;
      locked = true;
    };

    const unlock = () => {
      if (!locked) return;
      html.classList.remove("nl-scroll-locked");
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.paddingRight = previous.paddingRight;
      locked = false;
      window.scrollTo(0, scrollY);
    };

    const sync = () => {
      if (openOverlays().length > 0) lock();
      else unlock();
    };

    const onWheel = (event: WheelEvent) => {
      if (!locked || event.deltaY === 0) return;
      if (scrollableFrom(event.target, event.deltaY)) return;
      if (!overlayFor(event.target) && openOverlays().length === 0) return;
      event.preventDefault();
    };

    let touchStartY = 0;
    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!locked) return;
      const currentY = event.touches[0]?.clientY ?? touchStartY;
      const deltaY = touchStartY - currentY;
      if (deltaY === 0) return;
      if (scrollableFrom(event.target, deltaY)) return;
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!locked) return;
      const keys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
      if (!keys.includes(event.key) || isTypingTarget(event.target)) return;
      const scroller = nearestModalScroller(event.target);
      event.preventDefault();
      if (!scroller) return;
      const page = scroller.clientHeight * 0.9;
      const amount = event.key === "PageDown" || event.key === " "
        ? page
        : event.key === "PageUp"
          ? -page
          : event.key === "Home"
            ? -scroller.scrollHeight
            : event.key === "End"
              ? scroller.scrollHeight
              : event.key === "ArrowUp"
                ? -48
                : 48;
      scroller.scrollBy({ top: amount });
    };

    const observer = new MutationObserver(sync);
    observer.observe(body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-modal"],
    });
    sync();

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("keydown", onKeyDown, true);
      unlock();
    };
  }, []);

  return null;
}
