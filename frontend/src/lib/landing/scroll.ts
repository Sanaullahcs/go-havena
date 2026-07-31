import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/** Matches fixed header height used by scroll-spy in Header.tsx */
export const LANDING_SCROLL_OFFSET = 140;

const PENDING_SCROLL_KEY = "landingScrollTo";
const SCROLL_END_DELAY_MS = 80;

export const LANDING_SCROLL_SYNC_EVENT = "landing-scroll-sync";

let programmaticScrollTarget: string | null = null;

function notifyScrollSync(): void {
  window.dispatchEvent(new Event(LANDING_SCROLL_SYNC_EVENT));
}

function waitForScrollEnd(onEnd: () => void, behavior: ScrollBehavior): void {
  if (behavior !== "smooth") {
    onEnd();
    return;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    window.removeEventListener("scroll", onScroll);
    if (timeoutId) clearTimeout(timeoutId);
    onEnd();
  };

  const onScroll = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(finish, SCROLL_END_DELAY_MS);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/** Which landing section should be highlighted for the current scroll position. */
export function resolveActiveLandingSection(sectionIds: readonly string[]): string {
  if (programmaticScrollTarget === "__top__") {
    return "";
  }

  if (programmaticScrollTarget) {
    return programmaticScrollTarget;
  }

  const positions = sectionIds
    .map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      return { id, top: el.getBoundingClientRect().top + window.scrollY };
    })
    .filter((entry): entry is { id: string; top: number } => entry !== null)
    .sort((a, b) => a.top - b.top);

  if (positions.length === 0) return "";

  const scrollMarker = window.scrollY + LANDING_SCROLL_OFFSET;
  const atBottom =
    window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;

  if (atBottom) {
    return positions[positions.length - 1]!.id;
  }

  let active = "";
  for (const { id, top } of positions) {
    if (scrollMarker >= top - 2) {
      active = id;
    }
  }

  return active;
}

/** Scroll to the top of the landing page (hero). */
export function scrollToLandingTop(
  options?: { behavior?: ScrollBehavior; onComplete?: () => void }
): void {
  const behavior = options?.behavior ?? "smooth";
  programmaticScrollTarget = "__top__";

  window.scrollTo({
    top: 0,
    behavior,
  });

  waitForScrollEnd(() => {
    programmaticScrollTarget = null;
    options?.onComplete?.();
    notifyScrollSync();
  }, behavior);
}

export function scrollToLandingSection(
  sectionId: string,
  options?: { behavior?: ScrollBehavior; onComplete?: (sectionId: string) => void }
): boolean {
  const el = document.getElementById(sectionId);
  if (!el) return false;

  const behavior = options?.behavior ?? "smooth";
  programmaticScrollTarget = sectionId;

  const top = el.getBoundingClientRect().top + window.scrollY - LANDING_SCROLL_OFFSET;

  window.scrollTo({
    top: Math.max(0, top),
    behavior,
  });

  waitForScrollEnd(() => {
    programmaticScrollTarget = null;
    options?.onComplete?.(sectionId);
    notifyScrollSync();
  }, behavior);

  return true;
}

export function navigateToLandingSection(sectionId: string, router: AppRouterInstance): void {
  if (typeof window !== "undefined" && window.location.pathname === "/") {
    scrollToLandingSection(sectionId);
    return;
  }

  try {
    sessionStorage.setItem(PENDING_SCROLL_KEY, sectionId);
  } catch {
    // sessionStorage may be unavailable in private mode
  }

  router.push("/");
}

export function consumePendingLandingScroll(onComplete?: (sectionId: string) => void): void {
  try {
    const sectionId = sessionStorage.getItem(PENDING_SCROLL_KEY);
    if (!sectionId) return;

    sessionStorage.removeItem(PENDING_SCROLL_KEY);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToLandingSection(sectionId, { onComplete });
      });
    });
  } catch {
    // ignore
  }
}

/** One-time scroll for legacy `/#section` URLs, then strip the hash from the address bar. */
export function handleLegacyHashScroll(onComplete?: (sectionId: string) => void): void {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToLandingSection(hash, { onComplete });
      history.replaceState(null, "", window.location.pathname + window.location.search);
    });
  });
}
