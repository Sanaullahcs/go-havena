"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  Clock,
  CreditCard,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { confirmAdminSignOutAndRedirect } from "@/lib/auth/sign-out";
import {
  getCommunityAdminNextStep,
  getUser,
  updateUser,
  type WebUser,
} from "@/lib/auth/session";
import { fetchMe, meToSessionUser } from "@/lib/api/profile";

type ReviewState = "waiting" | "rejected" | "revoked";

function communityFromUser(user?: WebUser | null) {
  const membership =
    user?.memberships?.find((m) => m.role === "admin") ?? user?.memberships?.[0];
  return membership?.community ?? null;
}

export default function PendingApprovalPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Checking your account status…");
  const [title, setTitle] = useState("Almost there");
  const [state, setState] = useState<ReviewState>("waiting");
  const [communityName, setCommunityName] = useState<string | null>(null);
  const [billingComplete, setBillingComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const applyUser = useCallback(
    (user: WebUser | null) => {
      const step = getCommunityAdminNextStep(user);
      const access = user?.access;
      const community = communityFromUser(user);
      setCommunityName(community?.name ?? null);
      setBillingComplete(Boolean(access?.billing_complete || access?.card_on_file));

      if (step === "ready" || access?.can_use_dashboard) {
        router.replace("/admin");
        return;
      }
      if (step === "complete_billing_web") {
        router.replace("/admin/billing");
        return;
      }
      if (step === "link_community" || step === "complete_profile") {
        router.replace(communityAdminOnboardingPath(step));
        return;
      }

      if (step === "rejected") {
        if (access?.access_revoked || access?.blocking_reasons?.includes("admin_revoked")) {
          setState("revoked");
          setTitle("Access revoked");
          setMessage(
            "Your community admin access was revoked after it had been approved. Your subscription has been canceled and you will not be charged again.",
          );
        } else {
          setState("rejected");
          setTitle("Application not approved");
          setMessage(
            "Your community admin application or community request was not approved. Any saved card or subscription has been canceled and you will not be charged.",
          );
        }
        return;
      }

      setState("waiting");
      setTitle("Waiting for system approval");
      if (access?.billing_complete) {
        setMessage(
          "Your card is saved. A system administrator still needs to approve your profile and community. Your 30-day free trial starts only after that approval — you will not be charged before then.",
        );
      } else {
        setMessage(
          "Your account is under review. Add a card to continue — the free trial starts after system approval, not when you save the card.",
        );
      }
    },
    [router],
  );

  const refresh = useCallback(
    async (manual = false) => {
      if (manual) setBusy(true);
      try {
        const me = await fetchMe();
        updateUser(meToSessionUser(me));
        applyUser(getUser());
        setLastChecked(new Date());
      } catch {
        setMessage("We couldn’t refresh your status. Try again or sign in again.");
      } finally {
        if (manual) setBusy(false);
      }
    },
    [applyUser],
  );

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const waiting = state === "waiting";
  const timeline = useMemo(
    () => [
      { label: "Application submitted", detail: "Profile and community details received", status: "done" as const },
      {
        label: billingComplete ? "Card saved" : "Add a card",
        detail: billingComplete ? "Trial reserved — no charge yet" : "Required before the trial can start",
        status: billingComplete ? ("done" as const) : ("current" as const),
      },
      {
        label: "Havena review",
        detail: "A system admin is checking your community",
        status: billingComplete ? ("current" as const) : ("upcoming" as const),
      },
      {
        label: "Dashboard unlocks",
        detail: "Invite residents and start managing",
        status: "upcoming" as const,
      },
    ],
    [billingComplete],
  );

  return (
    <div className="w-full min-w-0 space-y-6 lg:space-y-8">
      <section
        className={[
          "relative overflow-hidden rounded-[28px] px-5 py-7 text-white sm:px-8 sm:py-9 lg:px-10",
          waiting ? "bg-[#1B4F8A]" : "bg-[#7A1F2B]",
        ].join(" ")}
      >
        <div
          className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />
        <div
          className={[
            "pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full blur-3xl",
            waiting ? "bg-teal-300/20" : "bg-rose-300/20",
          ].join(" ")}
          aria-hidden
        />

        <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/90 ring-1 ring-white/15">
                {waiting ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-200 opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-200" />
                    </span>
                    Under review
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3 w-3" aria-hidden />
                    {state === "revoked" ? "Access revoked" : "Not approved"}
                  </>
                )}
              </span>
              {communityName ? (
                <span className="truncate text-[13px] font-medium text-white/70">{communityName}</span>
              ) : null}
            </div>

            <h1 className="mt-4 max-w-2xl font-[family-name:var(--font-brand)] text-[2rem] font-bold leading-[1.08] tracking-tight sm:text-[2.45rem]">
              {title}
            </h1>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-white/75 sm:text-[15px]">{message}</p>
          </div>

          <div className="hidden h-24 w-24 items-center justify-center rounded-[28px] bg-white/10 ring-1 ring-white/15 sm:flex lg:h-28 lg:w-28">
            {waiting ? (
              <Clock className="h-10 w-10 text-teal-100" strokeWidth={1.6} aria-hidden />
            ) : (
              <ShieldAlert className="h-10 w-10 text-rose-100" strokeWidth={1.6} aria-hidden />
            )}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="space-y-4">
          {communityName ? (
            <div className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8F0F7] text-[#1B4F8A]">
                <Building2 className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Your community</p>
                <p className="mt-1 font-[family-name:var(--font-brand)] text-[1.25rem] font-bold text-slate-900">
                  {communityName}
                </p>
                <p className="mt-1 text-[13px] text-slate-500">
                  {waiting
                    ? "We’ll email you when this community is approved."
                    : "This community will not go live until a new application is approved."}
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "Human review",
                body: "A Havena admin confirms you’re the right operator.",
              },
              {
                icon: CreditCard,
                title: billingComplete ? "Card on file" : "Card needed",
                body: billingComplete
                  ? "Saved securely with Stripe. No charge until after approval and trial."
                  : "Save a card to reserve your plan before review finishes.",
              },
              {
                icon: Timer,
                title: "Trial waits",
                body: "The 30-day clock starts only after approval — not when you submit.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                <item.icon className="h-5 w-5 text-[#1B4F8A]" aria-hidden />
                <p className="mt-3 text-[14px] font-semibold text-slate-900">{item.title}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#1B4F8A]">Review progress</p>
          <ol className="mt-5 space-y-0">
            {(waiting
              ? timeline
              : [
                  { label: "Application submitted", detail: "We received your details", status: "done" as const },
                  {
                    label: state === "revoked" ? "Access removed" : "Review completed",
                    detail: "This account cannot use the dashboard",
                    status: "current" as const,
                  },
                ]
            ).map((step, index, list) => {
              const done = step.status === "done";
              const current = step.status === "current";
              return (
                <li key={step.label} className="flex gap-3">
                  <div className="flex w-7 flex-col items-center">
                    <span
                      className={[
                        "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold",
                        done
                          ? "bg-[#1B4F8A] text-white"
                          : current
                            ? "bg-[#E8F0F7] text-[#1B4F8A] ring-2 ring-[#1B4F8A]/20"
                            : "bg-slate-100 text-slate-400",
                      ].join(" ")}
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
                    </span>
                    {index < list.length - 1 ? (
                      <span className={["w-px flex-1", done ? "bg-[#1B4F8A]/30" : "bg-slate-200"].join(" ")} aria-hidden />
                    ) : null}
                  </div>
                  <div className={index < list.length - 1 ? "pb-5" : ""}>
                    <p className={["text-[14px] font-semibold", current ? "text-[#1B4F8A]" : "text-slate-900"].join(" ")}>
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{step.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>

      <div className="flex flex-col gap-3 rounded-[22px] border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-slate-500">
          {waiting
            ? lastChecked
              ? `Status refreshes automatically. Last checked ${lastChecked.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
              : "Status refreshes automatically every 15 seconds."
            : "Contact support if you think this decision was made in error."}
        </p>
        <div className="flex flex-wrap gap-2">
          {waiting ? (
            <button
              type="button"
              disabled={busy}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1B4F8A] px-4 text-sm font-semibold text-white transition hover:bg-[#163A66] disabled:opacity-60"
              onClick={() => void refresh(true)}
            >
              <RefreshCw className={["h-4 w-4", busy ? "animate-spin" : ""].join(" ")} aria-hidden />
              {busy ? "Checking…" : "Refresh status"}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={() => {
              void confirmAdminSignOutAndRedirect(router);
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
