"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DollarSign,
  Gift,
  Percent,
  ShieldAlert,
  Sparkles,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import {
  AdminBadge,
  DataTable,
  DtCell,
  DtHead,
  DtPagination,
  DtRow,
  DtTable,
  StatTile,
} from "@/components/admin/ui";
import { ThemedSelect } from "@/components/ui/themed-select";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { confirmAction, toastError, toastSuccess } from "@/lib/alert";
import { formatMoney } from "@/lib/api/billing";
import { apiError } from "@/lib/api/client";
import {
  fetchReferralAttributions,
  fetchReferralProgramSettings,
  formatReferralRewardLabel,
  reviewReferralAttribution,
  retryReferralReward,
  updateReferralProgramSettings,
  type ReferralAttributionRow,
  type ReferralRewardType,
} from "@/lib/api/referrals";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

type SettingsForm = {
  reward_type: ReferralRewardType;
  reward_percent: string;
  reward_fixed_amount: string;
  is_active: boolean;
};

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
    return <AdminBadge tone="amber">Awaiting first payment</AdminBadge>;
  }
  if (row.status === "locked") return <AdminBadge tone="slate">Signed up</AdminBadge>;
  return <AdminBadge tone="slate">{row.status}</AdminBadge>;
}

function fraudBadge(status: string) {
  if (status === "flagged") return <AdminBadge tone="amber">Flagged</AdminBadge>;
  if (status === "approved") return <AdminBadge tone="green">Review OK</AdminBadge>;
  if (status === "rejected") return <AdminBadge tone="red">Rejected</AdminBadge>;
  return null;
}

function buildRewardPreview(settings: SettingsForm): {
  headline: string;
  detail: string;
  valid: boolean;
} {
  if (settings.reward_type === "fixed") {
    const raw = settings.reward_fixed_amount.trim();
    const amount = Number(raw);
    if (raw === "" || !Number.isFinite(amount) || amount <= 0) {
      return {
        headline: "Fixed amount",
        detail: "Enter a reward amount greater than $0.00",
        valid: false,
      };
    }
    return {
      headline: formatMoney(Math.round(amount * 100), "usd"),
      detail: "Flat Stripe credit per successful referral",
      valid: true,
    };
  }

  const raw = settings.reward_percent.trim();
  const percent = Number(raw);
  if (raw === "" || !Number.isFinite(percent) || percent < 0) {
    return {
      headline: "Percentage",
      detail: "Enter a reward percentage between 0 and 100",
      valid: false,
    };
  }

  return {
    headline: `${percent}%`,
    detail: "Of the referee's first paid invoice subtotal",
    valid: true,
  };
}

function settingsEqual(a: SettingsForm, b: SettingsForm): boolean {
  return (
    a.reward_type === b.reward_type &&
    a.reward_percent === b.reward_percent &&
    a.reward_fixed_amount === b.reward_fixed_amount &&
    a.is_active === b.is_active
  );
}

function PrefixedNumberInput({
  prefix,
  suffix,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  prefix?: ReactNode;
  suffix?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
}) {
  return (
    <div className="flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-teal-300 focus-within:ring-2 focus-within:ring-teal-100">
      {prefix ? (
        <span className="flex w-11 shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50 text-slate-400">
          {prefix}
        </span>
      ) : null}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent px-3 text-[13px] text-slate-800 outline-none placeholder:text-slate-400"
      />
      {suffix ? (
        <span className="flex shrink-0 items-center border-l border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-slate-500">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

function PayoutPreviewCard({ settings }: { settings: SettingsForm }) {
  const preview = buildRewardPreview(settings);
  const isPercent = settings.reward_type === "percent";

  return (
    <div
      key={settings.reward_type}
      className={[
        "rounded-2xl border px-4 py-3.5 transition-colors sm:min-w-[260px]",
        preview.valid
          ? "border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50/80"
          : "border-amber-200 bg-amber-50/70",
      ].join(" ")}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Live payout preview</p>
      <div className="mt-2 flex items-start gap-3">
        <span
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            preview.valid ? "bg-white text-teal-700 shadow-sm" : "bg-white/80 text-amber-700",
          ].join(" ")}
        >
          {isPercent ? <Percent className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-[1.35rem] font-bold leading-none tracking-tight text-slate-900">{preview.headline}</p>
          <p className="mt-1.5 text-[12px] leading-snug text-slate-600">{preview.detail}</p>
        </div>
      </div>
    </div>
  );
}

export default function ReferralsAdminPage() {
  const [settings, setSettings] = useState<SettingsForm>({
    reward_type: "percent",
    reward_percent: "5",
    reward_fixed_amount: "50.00",
    is_active: true,
  });
  const [savedSettings, setSavedSettings] = useState<SettingsForm | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [rows, setRows] = useState<ReferralAttributionRow[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRefreshing(true);
    setError(null);
    try {
      const [settingsRes, listRes] = await Promise.all([
        fetchReferralProgramSettings(),
        fetchReferralAttributions({
          page,
          per_page: ADMIN_TABLE_PAGE_SIZE,
          q: debouncedSearch || undefined,
        }),
      ]);
      const nextSettings: SettingsForm = {
        reward_type: settingsRes.reward_type ?? "percent",
        reward_percent: String(settingsRes.reward_percent ?? 5),
        reward_fixed_amount: settingsRes.reward_fixed_cents
          ? (settingsRes.reward_fixed_cents / 100).toFixed(2)
          : "50.00",
        is_active: settingsRes.is_active,
      };
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      setRows(listRes.data);
      setLastPage(listRes.meta.last_page);
      setTotal(listRes.meta.total);
      setOverview(listRes.meta.overview);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const rewardPreview = useMemo(() => buildRewardPreview(settings), [settings]);
  const hasUnsavedChanges = savedSettings ? !settingsEqual(settings, savedSettings) : false;

  const updateSettings = (patch: Partial<SettingsForm>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const payload =
        settings.reward_type === "fixed"
          ? {
              reward_type: "fixed" as const,
              reward_fixed_cents: Math.round(Number(settings.reward_fixed_amount) * 100),
              is_active: settings.is_active,
            }
          : {
              reward_type: "percent" as const,
              reward_percent: Number(settings.reward_percent),
              is_active: settings.is_active,
            };

      const updated = await updateReferralProgramSettings(payload);
      const nextSettings: SettingsForm = {
        reward_type: updated.reward_type,
        reward_percent: String(updated.reward_percent),
        reward_fixed_amount: updated.reward_fixed_cents
          ? (updated.reward_fixed_cents / 100).toFixed(2)
          : settings.reward_fixed_amount,
        is_active: updated.is_active,
      };
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      toastSuccess("Referral settings saved.");
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSavingSettings(false);
    }
  };

  const review = async (row: ReferralAttributionRow, decision: "approve" | "reject") => {
    const result = await confirmAction({
      title: decision === "approve" ? "Approve flagged referral?" : "Reject flagged referral?",
      text:
        decision === "approve"
          ? "This allows payout if a pending reward exists."
          : "This disqualifies the referral and blocks payout.",
      confirmText: decision === "approve" ? "Approve" : "Reject",
      color: decision === "approve" ? "green" : "red",
    });
    if (!result.isConfirmed) return;
    try {
      await reviewReferralAttribution(row.id, decision);
      toastSuccess(decision === "approve" ? "Referral approved." : "Referral rejected.");
      await load({ silent: true });
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const retryReward = async (rewardId: number) => {
    try {
      const result = await retryReferralReward(rewardId);
      toastSuccess(result.status === "credited" ? "Credit applied." : "Retry attempted.");
      await load({ silent: true });
    } catch (err) {
      toastError(apiError(err));
    }
  };

  if (initialLoading) return <PageLoader skeleton text="Loading referral program…" />;
  if (error) return <PageError message={error} onRetry={() => load()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="nl-eyebrow">Platform billing</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Referral Program</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Configure referral rewards and review attributions, fraud flags, and payout status across all communities.
          </p>
        </div>
        <div
          className={[
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold",
            settings.is_active
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-slate-100 text-slate-600",
          ].join(" ")}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {settings.is_active ? "Program active" : "Program paused"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatTile
          label="Total"
          value={String(overview.total_attributions ?? 0)}
          hint="All attributions"
          tone="blue"
          icon={<Users className="h-5 w-5" />}
        />
        <StatTile
          label="Awaiting payment"
          value={String(overview.pending_qualification ?? 0)}
          hint="Approved, waiting on first paid invoice"
          tone="amber"
          icon={<Clock3 className="h-5 w-5" />}
        />
        <StatTile
          label="Rewarded"
          value={String(overview.qualified ?? 0)}
          hint="Credit applied"
          tone="green"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatTile
          label="Disqualified"
          value={String(overview.disqualified ?? 0)}
          hint="Blocked referrals"
          tone="red"
          icon={<XCircle className="h-5 w-5" />}
        />
        <StatTile
          label="Flagged"
          value={String(overview.flagged_for_review ?? 0)}
          hint="Needs review"
          tone="violet"
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <StatTile
          label="Credit paid"
          value={formatMoney(overview.total_credit_earned_cents ?? 0, "usd")}
          hint="Stripe balance credits"
          tone="cyan"
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      <section className="nl-panel overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Program settings</p>
              <h3 className="mt-1 text-[15px] font-semibold text-slate-900">Reward configuration</h3>
              <p className="mt-0.5 text-[12px] text-slate-500">
                New signups snapshot the active reward settings at attribution time.
              </p>
            </div>
            {hasUnsavedChanges ? (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
                Unsaved changes
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-slate-600">Reward type</span>
                  <ThemedSelect
                    value={settings.reward_type}
                    fieldKey="reward_type"
                    onChange={(value) =>
                      updateSettings({ reward_type: value as ReferralRewardType })
                    }
                    options={[
                      { value: "percent", label: "Percentage of invoice" },
                      { value: "fixed", label: "Fixed amount" },
                    ]}
                  />
                </label>

                {settings.reward_type === "percent" ? (
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-slate-600">Reward percent</span>
                    <PrefixedNumberInput
                      prefix={<Percent className="h-4 w-4" />}
                      suffix="%"
                      min={0}
                      max={100}
                      step="0.1"
                      value={settings.reward_percent}
                      onChange={(value) => updateSettings({ reward_percent: value })}
                      placeholder="5"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="mb-1.5 block text-[12px] font-medium text-slate-600">Fixed reward amount</span>
                    <PrefixedNumberInput
                      prefix={<span className="text-[13px] font-semibold text-slate-500">$</span>}
                      suffix="USD"
                      min={0.01}
                      step="0.01"
                      value={settings.reward_fixed_amount}
                      onChange={(value) => updateSettings({ reward_fixed_amount: value })}
                      placeholder="50.00"
                    />
                  </label>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <label className="flex items-center gap-2.5 text-[13px] font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.is_active}
                    onChange={(e) => updateSettings({ is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600"
                  />
                  Program active
                </label>
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={savingSettings || !rewardPreview.valid}
                  className="nl-btn-primary h-10 min-w-[140px] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingSettings ? "Saving…" : "Save settings"}
                </button>
              </div>
            </div>

            <PayoutPreviewCard settings={settings} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <InfoCard
              icon={Gift}
              title="Percent reward"
              body="Pays a percentage of the referee community's first paid invoice subtotal after trial."
              active={settings.reward_type === "percent"}
            />
            <InfoCard
              icon={DollarSign}
              title="Fixed reward"
              body="Pays a flat Stripe account credit amount regardless of invoice size."
              active={settings.reward_type === "fixed"}
            />
            <InfoCard
              icon={AlertTriangle}
              title="Snapshot rule"
              body="Changing settings only affects future signups. Existing attributions keep their locked reward."
            />
          </div>
        </div>
      </section>

      <div className="relative">
        {refreshing ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-white/55 pt-24 backdrop-blur-[1px]"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-medium text-slate-600 shadow-sm">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              Updating results…
            </span>
          </div>
        ) : null}

        <DataTable
          title="Attributions"
          totalCount={total}
          visibleCount={rows.length}
          search={searchInput}
          onSearch={(value) => {
            setSearchInput(value);
            setPage(1);
          }}
          searching={refreshing}
          searchPlaceholder="Search code, user, community…"
          isEmpty={rows.length === 0}
          empty="No referral attributions found."
        >
          <DtTable>
            <DtHead
              cols={[
                { label: "Referrer" },
                { label: "Referee" },
                { label: "Community" },
                { label: "Status" },
                { label: "Review" },
                { label: "Reward" },
                { label: "", right: true },
              ]}
            />
            <tbody>
              {rows.map((row) => (
                <DtRow key={row.id}>
                  <DtCell first>
                    <p className="font-medium text-slate-900">
                      {row.referrer?.name || row.referrer?.phone || `#${row.referrer?.id}`}
                    </p>
                  </DtCell>
                  <DtCell>
                    <p className="font-medium text-slate-800">
                      {row.referee?.name || row.referee?.phone || `#${row.referee?.id}`}
                    </p>
                  </DtCell>
                  <DtCell>{row.referee_community?.name ?? "—"}</DtCell>
                  <DtCell>{statusBadge(row)}</DtCell>
                  <DtCell>{fraudBadge(row.fraud_review_status) ?? <span className="text-slate-400">—</span>}</DtCell>
                  <DtCell>
                    {row.reward ? (
                      <div>
                        <p className="font-semibold text-slate-800">
                          {formatMoney(row.reward.amount_cents, "usd")}
                        </p>
                        <p className="text-[11px] capitalize text-slate-500">{row.reward.status}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium text-slate-700">{formatReferralRewardLabel(row)}</p>
                        <p className="text-[11px] text-slate-500">Pays after first invoice</p>
                      </div>
                    )}
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      actions={[
                        ...(row.fraud_review_status === "flagged"
                          ? [
                              { label: "Approve", onClick: () => review(row, "approve") },
                              { label: "Reject", onClick: () => review(row, "reject"), tone: "danger" as const },
                            ]
                          : []),
                        ...(row.reward && ["pending", "failed"].includes(row.reward.status)
                          ? [{ label: "Retry credit", onClick: () => retryReward(row.reward!.id) }]
                          : []),
                      ]}
                    />
                  </DtCell>
                </DtRow>
              ))}
            </tbody>
          </DtTable>
          <DtPagination
            showing={rows.length}
            total={total}
            page={page}
            lastPage={lastPage}
            onPageChange={setPage}
          />
        </DataTable>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  body,
  active = false,
}: {
  icon: typeof Gift;
  title: string;
  body: string;
  active?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-xl border px-4 py-3.5 transition-colors",
        active
          ? "border-teal-200 bg-teal-50/70 shadow-sm"
          : "border-slate-200 bg-slate-50/60",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 text-slate-700">
        <Icon className={["h-4 w-4", active ? "text-teal-700" : "text-slate-400"].join(" ")} />
        <p className="text-[13px] font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}
