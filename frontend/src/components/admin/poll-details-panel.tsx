"use client";

import type { ReactNode } from "react";
import {
  formatPollDateTime,
  pollRemainingLabel,
  pollVotingMethodLabel,
  pollWinnerLabels,
  type PollDetailsData,
} from "@/lib/poll-details";

export function PollDetailsPanel({ poll, startedAtFallback }: { poll: PollDetailsData; startedAtFallback?: string }) {
  const method = pollVotingMethodLabel(poll.voting_method);
  const startedAt = poll.started_at ?? startedAtFallback;
  const options = poll.options ?? [];
  const totalVotes = poll.total_votes ?? 0;
  const showResults = poll.results_visible !== false && (poll.total_votes != null || poll.closed);
  const winners = pollWinnerLabels(poll);
  const closed = Boolean(poll.closed);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Poll status</p>
          <span
            className={[
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              closed ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800",
            ].join(" ")}
          >
            {closed ? "Ended" : "Active"}
          </span>
        </div>
        <dl className="mt-3 grid gap-2 text-sm text-slate-700">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Started</dt>
            <dd className="text-end font-medium">{formatPollDateTime(startedAt)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Ends</dt>
            <dd className="text-end font-medium">{formatPollDateTime(poll.ends_at)}</dd>
          </div>
          {!closed ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Time remaining</dt>
              <dd className="text-end font-medium text-[#1B4F8A]">{pollRemainingLabel(poll.ends_at, closed)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded-xl border border-slate-100 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Voting method</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{method.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{method.detail}</p>
        {poll.vote_changes_allowed ? (
          <p className="mt-2 text-xs text-emerald-700">Vote changes are allowed until the poll closes.</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Voting is closed; votes can no longer be changed.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-100 p-4">
        <motionBetween
          left={
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Options</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{poll.options_count ?? options.length}</p>
            </>
          }
          right={
            showResults ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total votes</p>
                <p className="mt-1 text-2xl font-bold text-[#1B4F8A]">{totalVotes}</p>
              </>
            ) : null
          }
        />
        <ul className="mt-4 space-y-3">
          {options.map((option, index) => {
            const highlight = option.is_winner || option.is_leading;
            const votes = option.votes ?? 0;
            const percent = option.percent ?? 0;
            return (
              <li
                key={option.id}
                className={[
                  "rounded-xl border p-3",
                  highlight ? "border-[#1B4F8A] bg-[#E8F0F7]/60 ring-1 ring-[#1B4F8A]/20" : "border-slate-100 bg-slate-50/40",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {index + 1}. {option.label}
                    </p>
                    {option.is_winner ? (
                      <p className="mt-1 text-xs font-semibold text-[#1B4F8A]">Winner</p>
                    ) : option.is_leading && !closed ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">Currently leading</p>
                    ) : null}
                  </div>
                  {showResults ? (
                    <motionBetween
                      compact
                      left={<span className="text-sm font-semibold text-slate-800">{votes}</span>}
                      right={<span className="text-sm text-slate-500">{percent}%</span>}
                    />
                  ) : null}
                </div>
                {showResults ? (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-[#1B4F8A]"
                      style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {closed ? (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Final results</p>
          {poll.no_participation ? (
            <p className="mt-2 text-sm text-slate-700">No votes were cast before this poll closed.</p>
          ) : poll.is_tie ? (
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-semibold text-[#1B4F8A]">Tie:</span>{" "}
              {winners.join(", ")} received the highest number of votes ({totalVotes} total).
            </p>
          ) : winners.length > 0 ? (
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-semibold text-[#1B4F8A]">Winner:</span> {winners[0]} with{" "}
              {options.find((o) => o.is_winner)?.votes ?? 0} votes (
              {options.find((o) => o.is_winner)?.percent ?? 0}%).
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function motionBetween({
  left,
  right,
  compact,
}: {
  left: ReactNode;
  right?: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return <div className="flex shrink-0 items-center gap-3 text-end">{left}{right}</div>;
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>{left}</div>
      {right ? <div className="text-end">{right}</div> : null}
    </div>
  );
}
