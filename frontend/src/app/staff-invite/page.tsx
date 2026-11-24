"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HavenaLockup } from "@/components/shared/havena-lockup";
import { StoreBadges } from "@/components/marketing/store-badges";
import { storeLinks } from "@/lib/marketing/content";

const APP_SCHEME_PATH = "screens/staff-invite";
const ANDROID_PACKAGE = "com.zsquare.havena";

function isMobileUserAgent(ua: string) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function buildDeepLink(token: string) {
  const query = `token=${encodeURIComponent(token)}`;
  return {
    custom: `havena://${APP_SCHEME_PATH}?${query}`,
    androidIntent:
      `intent://${APP_SCHEME_PATH}?${query}` +
      `#Intent;scheme=havena;package=${ANDROID_PACKAGE};` +
      `S.browser_fallback_url=${encodeURIComponent(storeLinks.play)};end`,
  };
}

function StaffInviteContent() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || searchParams.get("staff_invite") || "").trim();
  const [isMobile, setIsMobile] = useState(false);
  const [openedApp, setOpenedApp] = useState(false);

  const links = useMemo(() => (token ? buildDeepLink(token) : null), [token]);

  useEffect(() => {
    const mobile = isMobileUserAgent(typeof navigator !== "undefined" ? navigator.userAgent : "");
    setIsMobile(mobile);
    if (!mobile || !links) return;

    // Hand off to the native app; desktop stays on this interstitial.
    const timer = window.setTimeout(() => {
      window.location.href = /Android/i.test(navigator.userAgent) ? links.androidIntent : links.custom;
      setOpenedApp(true);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [links]);

  const openInApp = () => {
    if (!links) return;
    window.location.href = /Android/i.test(navigator.userAgent) ? links.androidIntent : links.custom;
    setOpenedApp(true);
  };

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#F4F8FD]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 12% -10%, rgba(27,79,138,0.14), transparent 55%)," +
            "radial-gradient(ellipse 70% 50% at 100% 0%, rgba(232,120,46,0.10), transparent 50%)," +
            "linear-gradient(180deg, #EEF4FB 0%, #F4F8FD 42%, #F8FAFC 100%)",
        }}
        aria-hidden
      />

      <header className="relative z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3 sm:px-8">
          <a href="/" className="inline-flex rounded-lg outline-none ring-[#1B4F8A]/25 focus-visible:ring-2">
            <HavenaLockup size={44} />
          </a>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-12 sm:px-8">
        <div className="rounded-2xl border border-slate-200/80 bg-white/95 px-6 py-8 shadow-[0_18px_50px_-28px_rgba(10,42,67,0.35)] sm:px-10 sm:py-10">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#1B4F8A]/70">
            Staff access
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-quicksand),Quicksand,sans-serif] text-[1.75rem] font-bold leading-tight tracking-tight text-[#0A2A43] sm:text-[2rem]">
            Accept Your Staff Invitation
          </h1>

          {!token ? (
            <p className="mt-4 text-[15px] leading-relaxed text-[#5B6B7C]">
              This invitation link is missing or incomplete. Open the original email from Havena, or ask your
              community admin to resend the invitation.
            </p>
          ) : (
            <>
              <p className="mt-4 text-[15px] leading-relaxed text-[#5B6B7C]">
                This invitation can only be accepted through the Havena mobile app. Please open this invitation
                link on your mobile device.
              </p>

              {isMobile ? (
                <div className="mt-6 space-y-3">
                  <button
                    type="button"
                    onClick={openInApp}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-[#1B4F8A] px-4 py-3.5 text-[15px] font-semibold text-white transition hover:bg-[#163A66] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4F8A]/40"
                  >
                    {openedApp ? "Trying to open Havena…" : "Open in Havena app"}
                  </button>
                  <p className="text-center text-[13px] text-[#7C8B9A]">
                    Don’t have the app yet? Download it below, then return to this link.
                  </p>
                </div>
              ) : null}

              <div className="mt-8 border-t border-slate-100 pt-6">
                <p className="mb-3 text-[13px] font-medium text-[#0A2A43]">Download Havena</p>
                <div className="marketing-landing">
                  <StoreBadges tone="light" />
                </div>
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[13px] text-[#7C8B9A]">
          Invitation tokens stay private to your invite. Never accept from a shared or borrowed account.
        </p>
      </div>
    </main>
  );
}

export default function StaffInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#F4F8FD] text-[#5B6B7C]">
          Loading invitation…
        </main>
      }
    >
      <StaffInviteContent />
    </Suspense>
  );
}
