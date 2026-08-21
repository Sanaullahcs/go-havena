import Swal from "sweetalert2";

const ICO_CHECK =
  '<svg class="nl-swal-btn-ico" viewBox="0 0 24 24" fill="none" width="15" height="15" aria-hidden="true"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICO_X =
  '<svg class="nl-swal-btn-ico" viewBox="0 0 24 24" fill="none" width="15" height="15" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICO_ALERT =
  '<svg class="nl-swal-btn-ico" viewBox="0 0 24 24" fill="none" width="15" height="15" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function labeledButton(icon: string, text: string) {
  return `<span class="nl-swal-btn-label">${icon}<span>${text}</span></span>`;
}

/* ─── Brand-themed SweetAlert2 base ─── */
const nl = Swal.mixin({
  customClass: {
    popup:             "nl-swal-popup",
    title:             "nl-swal-title",
    htmlContainer:     "nl-swal-body",
    confirmButton:     "nl-swal-confirm",
    cancelButton:      "nl-swal-cancel",
    denyButton:        "nl-swal-deny",
    actions:           "nl-swal-actions",
    icon:              "nl-swal-icon",
  },
  buttonsStyling: false,
  reverseButtons: true,
  showClass: { popup: "nl-swal-show" },
  hideClass: { popup: "nl-swal-hide" },
});

/* ─── Confirm (destructive) ─── */
export async function confirmDelete(opts: {
  title?: string;
  text?: string;
  confirmText?: string;
}) {
  return nl.fire({
    icon: "warning",
    title: opts.title ?? "Are you sure?",
    html: opts.text ?? "This will remove it from active lists.",
    confirmButtonText: labeledButton(ICO_ALERT, opts.confirmText ?? "Delete"),
    showCancelButton: true,
    cancelButtonText: labeledButton(ICO_X, "Cancel"),
    customClass: {
      popup: "nl-swal-popup",
      title: "nl-swal-title",
      htmlContainer: "nl-swal-body",
      confirmButton: "nl-swal-confirm nl-swal-confirm--red",
      cancelButton: "nl-swal-cancel",
      actions: "nl-swal-actions",
      icon: "nl-swal-icon",
    },
  });
}

/* ─── Confirm (action) ─── */
export async function confirmAction(opts: {
  title?: string;
  text?: string;
  confirmText?: string;
  icon?: "question" | "warning" | "info";
  color?: "blue" | "amber" | "red" | "green";
}) {
  return nl.fire({
    icon: opts.icon ?? "question",
    title: opts.title ?? "Confirm action",
    html: opts.text ?? "Do you want to proceed?",
    confirmButtonText: labeledButton(
      opts.color === "red" ? ICO_ALERT : ICO_CHECK,
      opts.confirmText ?? "Confirm",
    ),
    showCancelButton: true,
    cancelButtonText: labeledButton(ICO_X, "Cancel"),
    customClass: {
      popup:         "nl-swal-popup",
      title:         "nl-swal-title",
      htmlContainer: "nl-swal-body",
      confirmButton: `nl-swal-confirm nl-swal-confirm--${opts.color ?? "blue"}`,
      cancelButton:  "nl-swal-cancel",
      actions:       "nl-swal-actions",
      icon:          "nl-swal-icon",
    },
    buttonsStyling: false,
    reverseButtons: true,
  });
}

export async function confirmRejectWithReason(opts: {
  title?: string;
  text?: string;
  confirmText?: string;
  maxLength?: number;
}) {
  const maxLength = opts.maxLength ?? 500;
  const intro = escapeAlertHtml(
    opts.text ?? "The applicant will be notified with your reason in the mobile app.",
  );

  return nl.fire({
    title: opts.title ?? "Reject request?",
    html: `
      <div class="nl-swal-reject">
        <div class="nl-swal-reject-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
            <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <p class="nl-swal-reject-intro">${intro}</p>
        <div class="nl-swal-reject-field">
          <label class="nl-swal-reject-label" for="nl-swal-reject-reason">
            Rejection reason <span class="nl-swal-required">Required</span>
          </label>
          <textarea
            id="nl-swal-reject-reason"
            class="nl-swal-textarea"
            maxlength="${maxLength}"
            rows="4"
            placeholder="Explain why this request was declined…"
            aria-label="Rejection reason"
          ></textarea>
          <div class="nl-swal-input-footer">
            <span class="nl-swal-input-hint">Shown to the applicant in the mobile app</span>
            <span class="nl-swal-char-count" aria-live="polite">
              <span id="nl-swal-char-current">0</span> / ${maxLength}
            </span>
          </div>
        </div>
      </div>
    `,
    confirmButtonText: labeledButton(ICO_ALERT, opts.confirmText ?? "Reject"),
    showCancelButton: true,
    cancelButtonText: labeledButton(ICO_X, "Cancel"),
    focusConfirm: false,
    customClass: {
      popup: "nl-swal-popup nl-swal-popup--reject",
      title: "nl-swal-title nl-swal-title--reject",
      htmlContainer: "nl-swal-body nl-swal-body--reject",
      confirmButton: "nl-swal-confirm nl-swal-confirm--red",
      cancelButton: "nl-swal-cancel",
      actions: "nl-swal-actions",
    },
    buttonsStyling: false,
    reverseButtons: true,
    didOpen: () => {
      const textarea = document.getElementById("nl-swal-reject-reason") as HTMLTextAreaElement | null;
      const counter = document.getElementById("nl-swal-char-current");
      const confirmBtn = Swal.getConfirmButton();

      const sync = () => {
        const raw = textarea?.value ?? "";
        const trimmed = raw.trim();
        if (counter) counter.textContent = String(raw.length);
        if (confirmBtn) {
          confirmBtn.disabled = trimmed.length < 3;
          confirmBtn.classList.toggle("nl-swal-confirm--disabled", trimmed.length < 3);
        }
      };

      textarea?.addEventListener("input", sync);
      sync();
      textarea?.focus();
    },
    preConfirm: () => {
      const textarea = document.getElementById("nl-swal-reject-reason") as HTMLTextAreaElement | null;
      const trimmed = String(textarea?.value ?? "").trim();

      if (!trimmed) {
        Swal.showValidationMessage("A rejection reason is required.");
        textarea?.focus();
        return false;
      }
      if (trimmed.length < 3) {
        Swal.showValidationMessage("Please enter at least 3 characters.");
        textarea?.focus();
        return false;
      }

      return trimmed;
    },
  });
}

function escapeAlertHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3800,
  timerProgressBar: true,
  buttonsStyling: false,
  showClass:  { popup: "nl-toast-show"  },
  hideClass:  { popup: "nl-toast-hide"  },
});

function fireToast(
  kind: "success" | "error" | "info" | "warning",
  msg: string,
  detail?: string,
) {
  return Toast.fire({
    icon: kind,
    title: msg,
    text: detail,
    customClass: {
      popup: `nl-swal-toast nl-swal-toast--${kind}`,
      title: "nl-toast-title",
      htmlContainer: "nl-toast-detail",
      icon: `nl-toast-icon nl-toast-icon--${kind}`,
      timerProgressBar: "nl-toast-bar",
    },
  });
}

export function toastSuccess(msg: string, detail?: string) {
  return fireToast("success", msg, detail);
}

export function toastError(msg: string, detail?: string) {
  return fireToast("error", msg, detail);
}

export function toastInfo(msg: string, detail?: string) {
  return fireToast("info", msg, detail);
}

export function toastWarning(msg: string, detail?: string) {
  return fireToast("warning", msg, detail);
}

export async function alertError(title: string, message: string) {
  return nl.fire({
    icon: "error",
    title,
    html: message,
    confirmButtonText: labeledButton(ICO_CHECK, "OK"),
  });
}

export async function showAccountBlockedAlert(message: string, block: import("@/lib/auth/account-block").AccountBlockDetails) {
  const { accountBlockHtml, accountBlockTitle } = await import("@/lib/auth/account-block");

  return nl.fire({
    icon: block.status === "rejected" ? "warning" : "error",
    title: accountBlockTitle(block),
    html: accountBlockHtml(message, block),
    confirmButtonText: "OK",
    customClass: {
      popup: "nl-swal-popup",
      title: "nl-swal-title",
      htmlContainer: "nl-swal-body",
      confirmButton: "nl-swal-confirm nl-swal-confirm--blue",
      actions: "nl-swal-actions",
      icon: "nl-swal-icon",
    },
    buttonsStyling: false,
  });
}
