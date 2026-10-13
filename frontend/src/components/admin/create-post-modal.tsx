"use client";

import { ClearableTextarea } from "@/components/admin/clearable-field";
import { useLayoutEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createPost, uploadPostImage } from "@/lib/api/feed";
import { apiError } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/alert";

const POST_BODY_MAX = 2000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const BODY_MIN_HEIGHT = 112;
const BODY_MAX_HEIGHT = 220;

const CATEGORIES = [
  { id: "general", label: "Recommendations" },
  { id: "event", label: "Events" },
  { id: "help", label: "Help" },
  { id: "update", label: "Neighborhood" },
  { id: "announcement", label: "Announcements" },
] as const;

const FIELD_LABEL = "text-[16px] font-semibold leading-6 text-[#0A2A43]";
const FIELD_CONTROL =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[15px] leading-6 text-[#0A2A43] outline-none placeholder:text-[15px] placeholder:text-slate-400 focus:border-[#1B4F8A] focus:bg-white focus:ring-2 focus:ring-[#1B4F8A]/15 disabled:opacity-60";

export function CreatePostModal({
  open,
  onClose,
  onPublished,
}: {
  open: boolean;
  onClose: () => void;
  onPublished?: () => void;
}) {
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["id"]>("general");
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bodyHeight, setBodyHeight] = useState(BODY_MIN_HEIGHT);
  const [bodyOverflow, setBodyOverflow] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.style.minHeight = "0px";
    node.style.height = "0px";
    const contentHeight = node.scrollHeight;
    const next = Math.min(BODY_MAX_HEIGHT, Math.max(BODY_MIN_HEIGHT, contentHeight));
    const overflows = contentHeight > BODY_MAX_HEIGHT;
    node.style.minHeight = "";
    node.style.height = `${next}px`;
    node.style.overflowY = overflows ? "auto" : "hidden";
    setBodyHeight((current) => (current === next ? current : next));
    setBodyOverflow((current) => (current === overflows ? current : overflows));
  }, [body, open]);

  if (!open) return null;

  const canPublish = (body.trim().length > 0 || image !== null) && !imageError && !busy;

  const reset = () => {
    setBody("");
    setCategory("general");
    setImage(null);
    setImageError("");
    setError("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = () => {
    if (busy) return;
    onClose();
  };

  const chooseImage = (file: File | null) => {
    setError("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) {
      setImage(null);
      setPreviewUrl(null);
      setImageError("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setImage(null);
      setPreviewUrl(null);
      setImageError("Choose a photo to attach.");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setImage(null);
      setPreviewUrl(null);
      setImageError("Photos must be 5 MB or smaller.");
      return;
    }
    setImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setImageError("");
  };

  const publish = async () => {
    const text = body.trim();
    if ((!text && !image) || imageError) {
      setError("Write something or add a photo before posting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const imageUrl = image ? await uploadPostImage(image) : undefined;
      await createPost({
        body: text || "Shared a photo",
        category,
        ...(imageUrl ? { image_url: imageUrl } : {}),
      });
      toastSuccess("Post published to your community feed.");
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
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-post-title"
        className="relative z-10 flex max-h-[min(92vh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6 sm:pt-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id="create-post-title" className="text-[24px] font-bold leading-8 text-[#0A2A43]">
                Create Post
              </h3>
              <p className="mt-2 text-[15px] leading-6 text-slate-500">
                Share an update with your community. It appears in Community Posts and the resident feed.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="mt-1 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
              disabled={busy}
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <p className={FIELD_LABEL}>Category</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORIES.map((item) => {
                  const selected = category === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={busy}
                      onClick={() => setCategory(item.id)}
                      className="min-h-11 rounded-full border px-4 py-2 text-[15px] font-medium transition disabled:opacity-60"
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

            <label className={`block ${FIELD_LABEL}`} htmlFor="create-post-body">
              Post
              <ClearableTextarea
                ref={bodyRef}
                id="create-post-body"
                value={body}
                maxLength={POST_BODY_MAX}
                disabled={busy}
                onChange={(event) => {
                  setBody(event.target.value.slice(0, POST_BODY_MAX));
                  setError("");
                }}
                className={`mt-2 resize-none ${FIELD_CONTROL}`}
                rows={4}
                placeholder="What would you like to share?"
                aria-describedby={body.length > 0 ? "create-post-count" : undefined}
                style={{
                  height: bodyHeight,
                  overflowY: bodyOverflow ? "auto" : "hidden",
                }}
              />
              {body.length > 0 ? (
                <p id="create-post-count" className="mt-1.5 text-right text-[15px] leading-6 text-slate-500 tabular-nums">
                  {body.length}/{POST_BODY_MAX}
                </p>
              ) : null}
            </label>

            <div>
              <p className={FIELD_LABEL}>Photo</p>
              <p className="mt-1 text-[15px] leading-6 text-slate-500">Optional. JPEG, PNG, WEBP, or GIF up to 5 MB.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={busy}
                onChange={(event) => chooseImage(event.target.files?.[0] ?? null)}
              />
              {previewUrl ? (
                <div className="relative mt-2 overflow-hidden rounded-xl border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="" className="max-h-48 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-lg bg-white/95 px-2 py-1 text-[14px] font-medium text-slate-600 shadow-sm"
                    onClick={() => chooseImage(null)}
                    disabled={busy}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-[15px] font-semibold text-[#1B4F8A] disabled:opacity-60"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <ImagePlus size={16} />
                  Add photo
                </button>
              )}
              {imageError ? <p className="mt-2 text-[15px] leading-6 text-red-600">{imageError}</p> : null}
            </div>

            {error ? <p className="text-[15px] leading-6 text-red-600">{error}</p> : null}

            <button
              type="button"
              disabled={!canPublish}
              onClick={publish}
              className="mt-1 w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-[16px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Publishing…" : "Publish Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
