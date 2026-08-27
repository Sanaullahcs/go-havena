"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Link2,
  Share2,
  Gift,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { AdminBadge, DtCell, DtHead, DtRow, DtTable, StatTile } from "@/components/admin/ui";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { formatMoney } from "@/lib/api/billing";
import {
  fetchMyReferralDashboard,
  formatReferralRewardLabel,
  type ReferralAttributionRow,
} from "@/lib/api/referrals";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import { PhoneDisplay } from "@/components/admin/phone-display";
import { formatPhoneDisplay } from "@/lib/phone/format";

function statusBadge(row: ReferralAttributionRow) {
  const display = row.display_status;
  if (display === "rewarded" || row.status === "qualified") {
    return <AdminBadge tone="green">Rewarded</AdminBadge>;
  }
  if (display === "disqualified" || row.status === "disqualified") {
    return <AdminBadge tone="red">Disqualified</AdminBadge>;
  }
  if (display === "payout_failed") {
    return <AdminBadge tone="red">Payout failed</AdminBadge>;
  }
  if (display === "payout_pending") {
    return <AdminBadge tone="sky">Payout pending</AdminBadge>;
  }
  if (display === "awaiting_payment" || row.status === "pending_qualification") {
    return <AdminBadge tone="amber">Pending payment</AdminBadge>;
  }
  return <AdminBadge tone="slate">Signed up</AdminBadge>;
}

function refereeLabel(row: ReferralAttributionRow): string {
  return row.referee?.name || formatPhoneDisplay(row.referee?.phone) || `User #${row.referee?.id ?? "?"}`;
}

function formatReferralDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function buildReferralLink(apiLink: string | null, code: string | null): string | null {
  if (!code) return apiLink;
  if (typeof window === "undefined") return apiLink;
  return `${window.location.origin}/register?ref=${encodeURIComponent(code)}`;
}

export default function ReferAndEarnPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchMyReferralDashboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchMyReferralDashboard());
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rewardLabel =
    data?.reward_label ??
    formatReferralRewardLabel({
      reward_type: data?.reward_type,
      reward_percent: data?.reward_percent ?? 5,
      reward_fixed_cents: data?.reward_fixed_cents,
    });

  const referralLink = useMemo(
    () => buildReferralLink(data?.referral_link ?? null, data?.referral_code ?? null),
    [data?.referral_link, data?.referral_code],
  );

  const copyText = async (text: string, kind: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toastSuccess(kind === "link" ? "Referral link copied." : "Referral code copied.");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toastError("Could not copy to clipboard.");
    }
  };

  const shareLink = async () => {
    if (!referralLink) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Join Havena as a community admin",
          text: `Use my referral link to sign up as a Havena community admin: ${referralLink}`,
          url: referralLink,
        });
        return;
      } catch {
        /* cancelled */
      }
    }
    await copyText(referralLink, "link");
  };

  if (loading) return <PageLoader skeleton text="Loading referral dashboard…" />;
  if (error || !data) {
    return <PageError message={error ?? "Unable to load referral dashboard."} onRetry={load} />;
  }

  const rewardHint =
    data.reward_type === "fixed"
      ? "Flat Stripe credit after first paid invoice"
      : "Of first paid invoice subtotal after trial";

  return (
    <div className="space-y-4">
      {/* Compact header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Refer & Earn</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Share your link · earn {rewardLabel} Stripe credit per successful referral
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800">
            <Gift className="h-3 w-3" />
            {rewardLabel}
          </span>
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              data.program_active
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800",
            ].join(" ")}
          >
            {data.program_active ? (
              <>
                <CheckCircle2 className="h-3 w-3" /> Active
              </>
            ) : (
              <>
                <Clock3 className="h-3 w-3" /> Paused
              </>
            )}
          </span>
        </div>
      </div>

      {!data.program_active ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-900">
          New referral rewards are paused. Your link stays available for when the program reopens.
        </div>
      ) : null}

      {/* Primary: share link + reward summary */}
      <section className="nl-panel overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-700">Your invite link</p>
                <p className="mt-0.5 text-[12px] text-slate-500">Locks attribution when someone signs up on web</p>
              </div>
              {data.referral_code ? (
                <button
                  type="button"
                  onClick={() => copyText(data.referral_code!, "code")}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[13px] font-bold tracking-wider text-slate-800 hover:bg-slate-100"
                  title="Copy code"
                >
                  {data.referral_code}
                  {copied === "code" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                </button>
              ) : null}
            </div>

            {referralLink ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <div className="flex min-h-10 flex-1 items-center gap-2.5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3">
                  <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <p className="truncate font-mono text-[12px] text-slate-700 sm:text-[13px]">{referralLink}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(referralLink, "link")}
                    className="nl-btn-primary h-10 flex-1 sm:flex-none sm:min-w-[120px]"
                  >
                    {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied === "link" ? "Copied" : "Copy link"}
                  </button>
                  <button type="button" onClick={shareLink} className="nl-btn-secondary h-10 px-3">
                    <Share2 className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">Share</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3.5 py-3 text-[13px] text-slate-600">
                Your link unlocks after Havena approves your community admin account.
              </div>
            )}

            {/* Slim how-it-works */}
            <ol className="grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
              {[
                { n: "1", t: "Share link", d: "Send to a new community admin" },
                { n: "2", t: "They subscribe", d: "Signup → approval → first paid invoice" },
                { n: "3", t: "You earn credit", d: `${rewardLabel} to your Stripe balance` },
              ].map((step) => (
                <li key={step.n} className="flex items-start gap-2.5 rounded-lg bg-slate-50/80 px-2.5 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1B4F8A] text-[11px] font-bold text-white">
                    {step.n}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-800">{step.t}</p>
                    <p className="text-[11px] leading-snug text-slate-500">{step.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <aside className="border-t border-slate-100 bg-gradient-to-b from-teal-50/90 to-emerald-50/50 p-4 sm:p-5 lg:border-l lg:border-t-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">Reward</p>
            <p className="mt-2 text-[1.75rem] font-bold leading-none tracking-tight text-slate-900">{rewardLabel}</p>
            <p className="mt-2 text-[11px] leading-snug text-slate-600">{rewardHint}</p>
            <div className="mt-4 border-t border-teal-200/60 pt-3">
              <p className="text-[11px] font-medium text-slate-500">Lifetime earned</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                {formatMoney(data.stats.total_credit_earned_cents, "usd")}
              </p>
            </div>
          </aside>
        </div>
      </section>

      {/* Stats */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total"
          value={String(data.stats.total_referrals)}
          hint="Attributed signups"
          tone="blue"
          icon={<Users className="h-5 w-5" />}
        />
        <StatTile
          label="Pending"
          value={String(data.stats.pending_referrals)}
          hint="Awaiting payment"
          tone="amber"
          icon={<Clock3 className="h-5 w-5" />}
        />
        <StatTile
          label="Successful"
          value={String(data.stats.successful_referrals)}
          hint="Credit applied"
          tone="green"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatTile
          label="Disqualified"
          value={String(data.stats.disqualified_referrals)}
          hint="Not eligible"
          tone="red"
          icon={<XCircle className="h-5 w-5" />}
        />
      </div>

      {/* History */}
      <section className="nl-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900">Referral history</h3>
            <p className="text-[11px] text-slate-500">Signups attributed to your link</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
            {data.history.length}
          </span>
        </div>

        {data.history.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-8 text-center sm:py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Wallet className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-800">No referrals yet</p>
            <p className="mt-1 max-w-sm text-[12px] text-slate-500">
              Copy your link above. When someone signs up and pays, they appear here with your reward status.
            </p>
          </div>
        ) : (
          <DtTable>
            <DtHead
              cols={[
                { label: "Referee" },
                { label: "Community" },
                { label: "Signed up" },
                { label: "Status" },
                { label: "Reward", right: true },
              ]}
            />
            <tbody>
              {data.history.map((row) => (
                <DtRow key={row.id}>
                  <DtCell first>
                    <p className="font-medium text-slate-900">{refereeLabel(row)}</p>
                    {row.referee?.phone ? (
                      <p className="mt-0.5 text-[12px] text-slate-500">
                        <PhoneDisplay value={row.referee.phone} compact />
                      </p>
                    ) : null}
                  </DtCell>
                  <DtCell>{row.referee_community?.name ?? "—"}</DtCell>
                  <DtCell nowrap>{formatReferralDate(row.locked_at)}</DtCell>
                  <DtCell>{statusBadge(row)}</DtCell>
                  <DtCell last right>
                    {row.reward?.status === "credited" ? (
                      <span className="font-semibold text-emerald-700">
                        {formatMoney(row.reward.amount_cents, "usd")}
                      </span>
                    ) : row.reward?.status === "pending" ? (
                      <span className="text-amber-700">Pending</span>
                    ) : (
                      <span className="text-slate-400">{formatReferralRewardLabel(row)}</span>
                    )}
                  </DtCell>
                </DtRow>
              ))}
            </tbody>
          </DtTable>
        )}
      </section>
    </div>
  );
}
