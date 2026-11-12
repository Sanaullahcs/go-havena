export type PollOptionRow = {
  id: number;
  label: string;
  votes?: number;
  percent?: number;
  is_winner?: boolean;
  is_leading?: boolean;
};

export type PollDetailsData = {
  question: string;
  description?: string | null;
  voting_method?: "single" | "multiple" | string;
  started_at?: string;
  ends_at?: string;
  closed?: boolean;
  active?: boolean;
  options_count?: number;
  total_votes?: number | null;
  options?: PollOptionRow[];
  winning_option_ids?: number[];
  leading_option_ids?: number[];
  is_tie?: boolean;
  no_participation?: boolean;
  vote_changes_allowed?: boolean;
  results_visible?: boolean;
};

export function formatPollDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function pollRemainingLabel(endsAt?: string | null, closed?: boolean): string {
  if (closed) return "Poll ended";
  if (!endsAt) return "—";
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return "—";
  const diff = end.getTime() - Date.now();
  if (diff <= 0) return "Poll ended";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Less than a minute left";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export function pollVotingMethodLabel(method?: string): { title: string; detail: string } {
  if (method === "multiple") {
    return {
      title: "Multiple choice",
      detail: "Residents may select more than one option while the poll is open. They can add or remove selections until the poll closes.",
    };
  }
  return {
    title: "Single choice",
    detail: "Residents pick one option. They may change their vote by selecting a different option until the poll closes.",
  };
}

export function pollWinnerLabels(poll: PollDetailsData): string[] {
  const ids = poll.winning_option_ids ?? [];
  if (!poll.closed || ids.length === 0) return [];
  return (poll.options ?? [])
    .filter((o) => ids.includes(o.id))
    .map((o) => o.label);
}
