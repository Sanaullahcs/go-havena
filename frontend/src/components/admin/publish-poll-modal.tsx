"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

function FieldLabel({
  children,
  required,
  htmlFor,
}: {
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label className="nl-notice-label" htmlFor={htmlFor}>
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return <p className="nl-notice-field-error">{children}</p>;
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
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="publish-poll-title" className="nl-notice-modal-title">
                Publish Poll
              </h3>
              <p className="nl-notice-schedule-hint mt-1">
                Create a poll to gather opinions and feedback from your community members.
              </p>
            </div>
            <button type="button" onClick={onClose} className="nl-notice-modal-close" aria-label="Close">
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="nl-notice-form-surface">
            <div className="nl-notice-form">
              <div className="nl-notice-field">
                <FieldLabel required>Poll question</FieldLabel>
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
                  className={inputClass(showError("question", liveErrors), "nl-input w-full")}
                  placeholder="Ask your community a question"
                />
                {showError("question", liveErrors) ? (
                  <FieldError>{showError("question", liveErrors)}</FieldError>
                ) : null}
              </div>

              <div className="nl-notice-field">
                <FieldLabel htmlFor="publish-poll-description">Short description (optional)</FieldLabel>
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
                  className={inputClass(
                    showError("description", liveErrors),
                    "nl-input nl-notice-textarea w-full resize-none",
                  )}
                  rows={3}
                  placeholder="Add a short note for residents"
                  aria-describedby={description.length > 0 ? "publish-poll-description-count" : undefined}
                  style={{
                    height: descriptionHeight,
                    overflowY: descriptionOverflow ? "auto" : "hidden",
                  }}
                />
                {description.length > 0 || showError("description", liveErrors) ? (
                  <div className="nl-notice-field-meta">
                    {showError("description", liveErrors) ? (
                      <FieldError>{showError("description", liveErrors)}</FieldError>
                    ) : (
                      <span />
                    )}
                    {description.length > 0 ? (
                      <p
                        id="publish-poll-description-count"
                        className={[
                          "nl-notice-char-count",
                          description.length >= POLL_DESCRIPTION_MAX ? "nl-notice-char-count--limit" : "",
                        ].join(" ")}
                        aria-live="polite"
                      >
                        {description.length}/{POLL_DESCRIPTION_MAX}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="nl-notice-field">
                <FieldLabel required>Options</FieldLabel>
                <div className="space-y-2">
                  {options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <ClearableInput
                        value={option}
                        maxLength={80}
                        disabled={busy}
                        onChange={(e) => {
                          setOptions((current) =>
                            current.map((item, itemIndex) => (itemIndex === index ? e.target.value : item)),
                          );
                          clearError("options");
                        }}
                        onBlur={() => touch("options")}
                        aria-invalid={Boolean(optionsHint)}
                        className={inputClass(optionsHint, "nl-input w-full")}
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
                    className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed border-[#1B4F8A]/35 bg-[#E8F0F7] px-4 py-2.5 transition hover:bg-[#dbe8f3] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => setOptions((current) => [...current, ""])}
                    disabled={busy}
                  >
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[#1B4F8A]">
                      <Plus size={14} strokeWidth={2.5} aria-hidden />
                    </span>
                    <span className="nl-notice-image-drop-title text-[#1B4F8A]">Add option</span>
                  </button>
                ) : null}
                {optionsHint ? (
                  <FieldError>{optionsHint}</FieldError>
                ) : (
                  <p className="nl-notice-schedule-note">Add at least 2 different options.</p>
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
                className="nl-btn-primary mt-1 w-full disabled:cursor-not-allowed"
              >
                {busy ? "Publishing…" : "Publish Poll"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}