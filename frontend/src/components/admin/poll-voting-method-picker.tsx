"use client";

export type PollVotingMethod = "single" | "multiple";

const OPTIONS: {
  value: PollVotingMethod;
  title: string;
  hint: string;
}[] = [
  { value: "single", title: "Single choice", hint: "— select one answer" },
  { value: "multiple", title: "Multiple choice", hint: "— select several answers" },
];

export function PollVotingMethodPicker({
  value,
  onChange,
  disabled = false,
  required = false,
  className = "",
}: {
  value: PollVotingMethod;
  onChange: (next: PollVotingMethod) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[16px] font-semibold leading-6 text-[#0A2A43]">
        Voting method
        {required ? <span className="text-red-600"> *</span> : null}
      </p>
      <div className="mt-3 space-y-3" role="radiogroup" aria-label="Voting method">
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60"
              style={{
                borderColor: selected ? "#1B4F8A" : "#e2e8f0",
                background: selected ? "#F8FBFD" : "#fff",
              }}
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                style={{ borderColor: selected ? "#1B4F8A" : "#cbd5e1" }}
              >
                {selected ? <span className="h-2.5 w-2.5 rounded-full bg-[#1B4F8A]" /> : null}
              </span>
              <span className="min-w-0 text-[15px] leading-6 text-[#0A2A43]">
                <span className="font-semibold">{option.title}</span>{" "}
                <span className="font-normal text-slate-500">{option.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
