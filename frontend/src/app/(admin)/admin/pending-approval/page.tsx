"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { communityAdminOnboardingPath } from "@/lib/admin/community-admin-onboarding";
import { confirmAdminSignOutAndRedirect } from "@/lib/auth/sign-out";
import {
  getCommunityAdminNextStep,
  getUser,
  updateUser,
} from "@/lib/auth/session";
import { fetchMe, meToSessionUser } from "@/lib/api/profile";

export default function PendingApprovalPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Checking your account status…");
  const [title, setTitle] = useState("Almost there");
  const [rejected, setRejected] = useState(false);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        updateUser(meToSessionUser(me));
        const user = getUser();
        const step = getCommunityAdminNextStep(user);
        const access = user?.access;

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
          setRejected(true);
          setTitle("Application not approved");
          setMessage(
            "Your community admin application or community request was not approved. Any trial subscription has been canceled and you will not be charged.",
          );
          return;
        }

        setRejected(false);
        setTitle("Waiting for system approval");
        if (access?.billing_complete) {
          setMessage(
            "Your card and subscription trial are set up. A system administrator still needs to approve your profile and community before you can use the dashboard.",
          );
        } else {
          setMessage(
            "Your account is under review. Complete billing if you haven’t already — full access unlocks after system approval.",
          );
        }
      } catch {
        if (!cancelled) {
          setMessage("We couldn’t refresh your status. Pull to retry or sign in again.");
        }
      }
    };

    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [router]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Community admin</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        {!rejected ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            onClick={async () => {
              setBusy(true);
              try {
                const me = await fetchMe();
                updateUser(meToSessionUser(me));
                const user = getUser();
                const step = getCommunityAdminNextStep(user);
                if (step === "ready" || user?.access?.can_use_dashboard) {
                  router.replace("/admin");
                } else if (step === "complete_billing_web") {
                  router.replace("/admin/billing");
                } else if (step === "rejected") {
                  setRejected(true);
                  setTitle("Application not approved");
                  setMessage(
                    "Your community admin application or community request was not approved. Any trial subscription has been canceled and you will not be charged.",
                  );
                } else {
                  setRejected(false);
                  setTitle("Waiting for system approval");
                  setMessage(
                    user?.access?.billing_complete
                      ? "Your card and subscription trial are set up. A system administrator still needs to approve your profile and community before you can use the dashboard."
                      : "Your account is under review. Complete billing if you haven’t already — full access unlocks after system approval.",
                  );
                }
              } catch {
                setMessage("We couldn’t refresh your status. Try again or sign in again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Checking…" : "Refresh status"}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => {
            void confirmAdminSignOutAndRedirect(router);
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
