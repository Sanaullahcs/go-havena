"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { joinByInviteCode } from "@/lib/api/communities";
import { fetchMe, meToSessionUser } from "@/lib/api/profile";
import { apiError } from "@/lib/api/client";
import {
  clearSession,
  getToken,
  getUser,
  hasApprovedCommunityMembership,
  getPendingResidentMembership,
  getResidentCommunityName,
  isCommunityAdminUser,
  isSystemAdminUser,
  updateUser,
} from "@/lib/auth/session";
import { logout } from "@/lib/api/auth";
import { AuthErrorBanner } from "@/components/auth/auth-form-shell";
import { LoadingButton } from "@/components/shared/loaders";

export default function JoinCommunityPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(true);
  const [userName, setUserName] = useState("there");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login?audience=resident");
      return;
    }

    const user = getUser();
    if (isSystemAdminUser(user) || isCommunityAdminUser(user)) {
      router.replace("/admin");
      return;
    }
    if (hasApprovedCommunityMembership(user)) {
      router.replace("/home");
      return;
    }

    const pending = getPendingResidentMembership(user);
    const name = pending?.community?.name ?? getResidentCommunityName(user);
    setPendingName(name);
    setShowInviteForm(!name);
    setUserName(user?.name || user?.profile?.display_name || "there");
    setChecked(true);
  }, [router]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const invite = code.trim();
    if (invite.length < 6 || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await joinByInviteCode(invite);
      const me = await fetchMe();
      updateUser(meToSessionUser(me));
      if (hasApprovedCommunityMembership()) {
        router.replace("/home");
        return;
      }
      const pending = getPendingResidentMembership();
      setPendingName(pending?.community?.name ?? me.memberships?.[0]?.community?.name ?? "your community");
      setShowInviteForm(false);
      setCode("");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    clearSession();
    router.replace("/login?audience=resident");
  };

  if (!checked) {
    return <div className="min-h-screen bg-[#f4f8fd]" />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f8fd] px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 w-full bg-[#1B4F8A]" />
        <div className="px-6 py-7 sm:px-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-teal-700">
            Resident portal
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {pendingName ? "Waiting for approval" : `Welcome, ${userName}`}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {pendingName
              ? `Your request to join ${pendingName} is with the community admin. You can open the portal as soon as they approve you.`
              : "Enter the invite code your community admin sent. Residents do not create communities — they join one."}
          </p>

          {error ? (
            <div className="mt-4">
              <AuthErrorBanner message={error} />
            </div>
          ) : null}

          {showInviteForm ? (
            <form onSubmit={handleJoin} className="mt-6 space-y-4">
              <div>
                <label htmlFor="invite-code" className="mb-1.5 block text-[13px] font-semibold text-slate-700">
                  Invite code
                </label>
                <input
                  id="invite-code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  autoComplete="one-time-code"
                  placeholder="MAPLE-2024-XYZ"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm tracking-[0.08em] text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </div>
              <LoadingButton
                type="submit"
                disabled={submitting || code.trim().length < 6}
                loading={submitting}
                loadingText="Joining…"
                className="nl-auth-btn w-full py-3"
              >
                Join community
              </LoadingButton>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowInviteForm(true)}
              className="mt-6 text-[13px] font-semibold text-[#0d9488] hover:underline"
            >
              Have a different invite code?
            </button>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="mt-6 block w-full text-center text-[12px] font-medium text-slate-400 hover:text-slate-600"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
