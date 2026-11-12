"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { createPost } from "@/lib/api/feed";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";

const DURATIONS = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
];

const POLL_DESCRIPTION_MAX = 500;
const DESCRIPTION_MIN_HEIGHT = 88;
const DESCRIPTION_MAX_HEIGHT = 220;

const FIELD_LABEL = "text-[13px] font-medium leading-5 text-slate-700";
const FIELD_CONTROL =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm leading-5 text-slate-900 outline-none placeholder:text-sm placeholder:text-slate-400 focus:border-[#1B4F8A] focus:bg-white focus:ring-2 focus:ring-[#1B4F8A]/15 disabled:opacity-60";

function pollOptionsState(options: string[]) {
  const labels: string[] = [];
  const seen = new Set<string>();
  let duplicate = false;

  for (const option of options) {
    const label = option.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) {
      duplicate = true;
      continue;
    }
    seen.add(key);
    labels.push(label);
  }

  return { labels, duplicate };
}

export function PublishPollModal({
  open,
  onClose,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  onPublished?: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [duration, setDuration] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [descriptionHeight, setDescriptionHeight] = useState(DESCRIPTION_MIN_HEIGHT);
  const [descriptionOverflow, setDescriptionOverflow] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const optionState = useMemo(() => pollOptionsState(options), [options]);

  useLayoutEffect(() => {
    const node = descriptionRef.current;
    if (!node) return;
    node.style.minHeight = "0px";
    node.style.height = "0px";
    const contentHeight = node.scrollHeight;
    const next = Math.min(DESCRIPTION_MAX_HEIGHT, Math.max(DESCRIPTION_MIN_HEIGHT, contentHeight));
    const overflows = contentHeight > DESCRIPTION_MAX_HEIGHT;
    node.style.minHeight = "";
    node.style.height = `${next}px`;
    node.style.overflowY = overflows ? "auto" : "hidden";
    setDescriptionHeight((current) => (current === next ? current : next));
    setDescriptionOverflow((current) => (current === overflows ? current : overflows));
  }, [description, open]);
  const canPublish =
    question.trim().length > 0 && optionState.labels.length >= 2 && !optionState.duplicate && !busy;

  if (!open) return null;

  const reset = () => {
    setQuestion("");
    setDescription("");
    setOptions(["", ""]);
    setDuration(3);
    setError("");
  };

  const publish = async () => {
    const labels = pollOptionsState(options);
    if (!question.trim() || labels.labels.length < 2 || labels.duplicate) {
      setError(labels.duplicate ? "Each option must be different." : "Enter a question and at least 2 different options.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createPost({
        category: "poll",
        poll: {
          question: question.trim(),
          description: description.trim(),
          duration_days: duration,
          options: labels.labels,
        },
      });
      toastSuccess("Poll published to your community feed.");
      reset();
      onPublished?.();
      onClose();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-poll-title"
        className="relative z-10 flex max-h-[min(92vh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6 sm:pt-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="publish-poll-title" className="text-lg font-bold tracking-tight text-slate-900">
                Publish Poll
              </h3>
              <p className="mt-1 text-sm leading-5 text-slate-500">
                Create a poll to gather opinions and feedback from your community members.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <label className={`block ${FIELD_LABEL}`}>
              Poll question
              <ClearableInput
                value={question}
                maxLength={200}
                disabled={busy}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setError("");
                }}
                className={`mt-1.5 ${FIELD_CONTROL}`}
                placeholder="Ask your community a question"
              />
            </label>

            <label className={`block ${FIELD_LABEL}`} htmlFor="publish-poll-description">
              Short description (optional)
              <ClearableTextarea
                ref={descriptionRef}
                id="publish-poll-description"
                value={description}
                maxLength={POLL_DESCRIPTION_MAX}
                disabled={busy}
                onChange={(e) => setDescription(e.target.value.slice(0, POLL_DESCRIPTION_MAX))}
                className={`mt-1.5 resize-none ${FIELD_CONTROL}`}
                rows={3}
                placeholder="Add a short note for residents"
                aria-describedby={description.length > 0 ? "publish-poll-description-count" : undefined}
                style={{
                  height: descriptionHeight,
                  overflowY: descriptionOverflow ? "auto" : "hidden",
                }}
              />
              {description.length > 0 ? (
                <p
                  id="publish-poll-description-count"
                  className="mt-1 text-right text-[11px] leading-4 text-slate-400 tabular-nums"
                  aria-live="polite"
                >
                  {description.length}/{POLL_DESCRIPTION_MAX}
                </p>
              ) : null}
            </label>

            <div>
              <p className={FIELD_LABEL}>Options</p>
              <div className="mt-1.5 space-y-2">
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <ClearableInput
                      value={option}
                      maxLength={80}
                      disabled={busy}
                      onChange={(e) => {
                        setOptions((current) => current.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)));
                        setError("");
                      }}
                      className={FIELD_CONTROL}
                      placeholder={`Option ${index + 1}`}
                      aria-label={`Option ${index + 1}`}
                    />
                    {options.length > 2 ? (
                      <button
                        type="button"
                        className="shrink-0 px-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                        onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        disabled={busy}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {options.length < 4 ? (
                <button
                  type="button"
                  className="mt-2.5 text-[13px] font-semibold text-[#1B4F8A] hover:underline"
                  onClick={() => setOptions((current) => [...current, ""])}
                  disabled={busy}
                >
                  Add option
                </button>
              ) : null}
              <p className={`mt-1.5 text-xs leading-4 ${optionState.duplicate ? "text-red-600" : "text-slate-500"}`}>
                {optionState.duplicate ? "Each option must be different." : "Add at least 2 different options."}
              </p>
            </div>

            <div>
              <p className={FIELD_LABEL}>Poll duration</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {DURATIONS.map((item) => {
                  const selected = duration === item.days;
                  return (
                    <button
                      key={item.days}
                      type="button"
                      onClick={() => setDuration(item.days)}
                      disabled={busy}
                      className="min-h-10 min-w-[5.25rem] flex-1 rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60"
                      style={{
                        borderColor: selected ? "#1B4F8A" : "#e2e8f0",
                        background: selected ? "#E0F2FE" : "#fff",
                        color: "#0A2A43",
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error ? <p className="text-xs leading-4 text-red-600">{error}</p> : null}

            <button
              type="button"
              disabled={!canPublish}
              onClick={publish}
              className="mt-1 w-full rounded-xl bg-[#1B4F8A] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Publishing…" : "Publish Poll"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
