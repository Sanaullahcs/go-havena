"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { createPost } from "@/lib/api/feed";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";
import {
  DEFAULT_POLL_DURATION,
  type PollDurationSelection,
  toPollDurationApiPayload,
} from "@/lib/poll-duration";
import { PollDurationPicker } from "@/components/admin/poll-duration-picker";
import { PollVotingMethodPicker, type PollVotingMethod } from "@/components/admin/poll-voting-method-picker";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import { hasFieldErrors, inputClass, type FieldErrors } from "@/lib/admin/form-validation-utils";

const POLL_DESCRIPTION_MAX = 500;
const DESCRIPTION_MIN_HEIGHT = 88;
const DESCRIPTION_MAX_HEIGHT = 220;

const FIELD_LABEL = "text-[16px] font-semibold leading-6 text-[#0A2A43]";
const FIELD_CONTROL =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[15px] leading-6 text-[#0A2A43] outline-none placeholder:text-[15px] placeholder:text-slate-400 focus:border-[#1B4F8A] focus:bg-white focus:ring-2 focus:ring-[#1B4F8A]/15 disabled:opacity-60";

function RequiredMark() {
  return (
    <span className="text-red-600" aria-hidden>
      {" "}
      *
    </span>
  );
}

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
  const [duration, setDuration] = useState<PollDurationSelection>(DEFAULT_POLL_DURATION);
  const [votingMethod, setVotingMethod] = useState<PollVotingMethod>("single");
  const [busy, setBusy] = useState(false);
  const [descriptionHeight, setDescriptionHeight] = useState(DESCRIPTION_MIN_HEIGHT);
  const [descriptionOverflow, setDescriptionOverflow] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const optionState = useMemo(() => pollOptionsState(options), [options]);
  const { touch, clearError, showError, validateOnSubmit, resetTouched } = useTouchedFieldErrors();

  const liveErrors = useMemo<FieldErrors>(() => {
    const next: FieldErrors = {};
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      next.question = "Enter a poll question.";
    } else if (trimmedQuestion.length > 200) {
      next.question = "Question must be 200 characters or fewer.";
    }
    if (description.trim().length > POLL_DESCRIPTION_MAX) {
      next.description = "Short description must be 500 characters or fewer.";
    }
    if (optionState.duplicate) {
      next.options = "Each option must be different.";
    } else if (optionState.labels.length < 2) {
      next.options = "Add at least 2 different options.";
    }
    return next;
  }, [question, description, optionState]);

  useEffect(() => {
    if (open) resetTouched();
  }, [open, resetTouched]);

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
  const canPublish = !hasFieldErrors(liveErrors) && !busy;
  const optionsHint = showError("options", liveErrors);

  if (!open) return null;

  const reset = () => {
    setQuestion("");
    setDescription("");
    setOptions(["", ""]);
    setDuration(DEFAULT_POLL_DURATION);
    setVotingMethod("single");
    resetTouched();
  };

  const publish = async () => {
    if (!validateOnSubmit(liveErrors)) return;
    const labels = pollOptionsState(options);
    setBusy(true);
    try {
      await createPost({
        category: "poll",
        poll: {
          question: question.trim(),
          description: description.trim(),
          ...toPollDurationApiPayload(duration),
          voting_method: votingMethod,
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
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id="publish-poll-title" className="text-[24px] font-bold leading-8 text-[#0A2A43]">
                Publish Poll
              </h3>
              <p className="mt-2 text-[15px] leading-6 text-slate-500">
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

          <div className="space-y-5">
            <label className={`block ${FIELD_LABEL}`}>
              Poll question
              <RequiredMark />
              <ClearableInput
                value={question}
                maxLength={200}
                disabled={busy}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  clearError("question");
                }}
                onBlur={() => touch("question")}
                aria-invalid={Boolean(showError("question", liveErrors))}
                className={inputClass(showError("question", liveErrors), `mt-2 ${FIELD_CONTROL}`)}
                placeholder="Ask your community a question"
              />
              {showError("question", liveErrors) ? (
                <p className="mt-1.5 text-[14px] leading-5 text-red-600">{showError("question", liveErrors)}</p>
              ) : null}
            </label>

            <label className={`block ${FIELD_LABEL}`} htmlFor="publish-poll-description">
              Short description (optional)
              <ClearableTextarea
                ref={descriptionRef}
                id="publish-poll-description"
                value={description}
                maxLength={POLL_DESCRIPTION_MAX}
                disabled={busy}
                onChange={(e) => {
                  setDescription(e.target.value.slice(0, POLL_DESCRIPTION_MAX));
                  clearError("description");
                }}
                onBlur={() => touch("description")}
                aria-invalid={Boolean(showError("description", liveErrors))}
                className={inputClass(showError("description", liveErrors), `mt-2 resize-none ${FIELD_CONTROL}`)}
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
                  className="mt-1.5 text-right text-[15px] leading-6 text-slate-500 tabular-nums"
                  aria-live="polite"
                >
                  {description.length}/{POLL_DESCRIPTION_MAX}
                </p>
              ) : null}
              {showError("description", liveErrors) ? (
                <p className="mt-1.5 text-[14px] leading-5 text-red-600">{showError("description", liveErrors)}</p>
              ) : null}
            </label>

            <div>
              <p className={FIELD_LABEL}>
                Options
                <RequiredMark />
              </p>
              <div className="mt-2 space-y-2.5">
                {options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <ClearableInput
                      value={option}
                      maxLength={80}
                      disabled={busy}
                      onChange={(e) => {
                        setOptions((current) => current.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)));
                        clearError("options");
                      }}
                      onBlur={() => touch("options")}
                      aria-invalid={Boolean(optionsHint)}
                      className={inputClass(optionsHint, FIELD_CONTROL)}
                      placeholder={`Option ${index + 1}`}
                      aria-label={`Option ${index + 1}`}
                    />
                    {index >= 2 ? (
                      <button
                        type="button"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-red-200 bg-red-50 text-slate-500 hover:text-red-700 disabled:opacity-60"
                        onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        disabled={busy}
                        aria-label={`Remove option ${index + 1}`}
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <span className="h-8 w-8 shrink-0" aria-hidden />
                    )}
                  </div>
                ))}
              </div>
              {options.length < 20 ? (
                <button
                  type="button"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed border-[#1B4F8A]/35 bg-[#E8F0F7] px-4 py-3 text-[15px] font-semibold text-[#1B4F8A] transition hover:bg-[#dbe8f3] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => setOptions((current) => [...current, ""])}
                  disabled={busy}
                >
                  <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[#1B4F8A]">
                    <Plus size={14} strokeWidth={2.5} aria-hidden />
                  </span>
                  Add option
                </button>
              ) : null}
              {optionsHint ? (
                <p className="mt-2 text-[14px] leading-5 text-red-600">{optionsHint}</p>
              ) : (
                <p className="mt-2 text-[15px] leading-6 text-slate-500">Add at least 2 different options.</p>
              )}
            </div>

            <PollVotingMethodPicker
              value={votingMethod}
              onChange={setVotingMethod}
              disabled={busy}
              required
            />

            <PollDurationPicker value={duration} onChange={setDuration} disabled={busy} required />


            <button
              type="button"
              disabled={!canPublish}
              onClick={publish}
              className="mt-1 w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-[16px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Publishing…" : "Publish Poll"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
