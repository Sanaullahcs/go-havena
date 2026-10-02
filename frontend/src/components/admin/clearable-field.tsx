"use client";

import {
  forwardRef,
  useCallback,
  useRef,
  type InputHTMLAttributes,
  type MutableRefObject,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import { X } from "lucide-react";

const NON_CLEARABLE_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "file",
  "hidden",
  "image",
  "month",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week",
]);

type ClearableInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Hide the clear control, for example while a search spinner uses the same slot. */
  hideClear?: boolean;
};

type ClearableTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  hideClear?: boolean;
};

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as MutableRefObject<T | null>).current = value;
}

function hasText(value: InputHTMLAttributes<HTMLInputElement>["value"]) {
  return value != null && String(value).length > 0;
}

function isLayoutClass(token: string) {
  const body = token.replace(/^!/, "").replace(/^(sm|md|lg|xl|2xl):/, "");
  return /^(w-|min-w-|max-w-|flex-1$|flex-auto$|flex-none$|grow$|grow-|shrink$|shrink-|basis-|col-span-|row-span-|self-|justify-self-|ms-|me-|m[trblxy]?-)/.test(body);
}

function partitionClasses(className = "") {
  const layout: string[] = [];
  const rest: string[] = [];
  for (const token of className.split(/\s+/).filter(Boolean)) {
    if (isLayoutClass(token)) layout.push(token);
    else rest.push(token);
  }
  if (!layout.some((token) => /(?:^|:)(?:!)?w-/.test(token))) {
    layout.push("w-full");
  }
  return {
    wrapper: ["relative", "min-w-0", ...layout].join(" "),
    control: [...rest, "w-full", "min-w-0", "nl-clearable-control"].join(" "),
  };
}

function clearControl(element: HTMLInputElement | HTMLTextAreaElement, previousValue: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  const tracker = (element as HTMLInputElement & { _valueTracker?: { setValue: (value: string) => void } })._valueTracker;
  tracker?.setValue(previousValue);
  setter?.call(element, "");
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.focus();
}

function ClearButton({
  label,
  multiline = false,
  number = false,
  onClear,
}: {
  label: string;
  multiline?: boolean;
  number?: boolean;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      className={["nl-clear-button", multiline ? "nl-clear-button-top" : "", number ? "nl-clear-button-number" : ""].join(" ")}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClear}
    >
      <X aria-hidden />
    </button>
  );
}

export const ClearableInput = forwardRef<HTMLInputElement, ClearableInputProps>(function ClearableInput(
  { hideClear = false, className, style, value, onKeyDown, ...props },
  ref,
) {
  const innerRef = useRef<HTMLInputElement>(null);
  const type = props.type ?? "text";
  const setRef = useCallback((node: HTMLInputElement | null) => {
    innerRef.current = node;
    assignRef(ref, node);
  }, [ref]);

  if (NON_CLEARABLE_TYPES.has(type)) {
    return <input ref={setRef} type={type} className={className} style={style} value={value} onKeyDown={onKeyDown} {...props} />;
  }

  const showClear = !hideClear && !props.readOnly && !props.disabled && hasText(value);
  const { wrapper, control } = partitionClasses(className);
  const number = type === "number";

  return (
    <div className={wrapper}>
      <input
        {...props}
        ref={setRef}
        type={type}
        value={value}
        className={control}
        style={showClear ? { ...style, paddingRight: number ? "4.25rem" : "2.75rem" } : style}
        onKeyDown={onKeyDown}
      />
      {showClear ? (
        <ClearButton
          label={type === "search" ? "Clear search" : "Clear"}
          number={number}
          onClear={() => {
            const input = innerRef.current;
            if (!input) return;
            clearControl(input, String(value ?? ""));
          }}
        />
      ) : null}
    </div>
  );
});

export const ClearableTextarea = forwardRef<HTMLTextAreaElement, ClearableTextareaProps>(function ClearableTextarea(
  { hideClear = false, className, style, value, ...props },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const setRef = useCallback((node: HTMLTextAreaElement | null) => {
    innerRef.current = node;
    assignRef(ref, node);
  }, [ref]);
  const showClear = !hideClear && !props.readOnly && !props.disabled && hasText(value);
  const { wrapper, control } = partitionClasses(className);

  return (
    <div className={wrapper}>
      <textarea
        {...props}
        ref={setRef}
        value={value}
        className={control}
        style={showClear ? { ...style, paddingRight: "2.75rem" } : style}
      />
      {showClear ? (
        <ClearButton
          label="Clear"
          multiline
          onClear={() => {
            const input = innerRef.current;
            if (!input) return;
            clearControl(input, String(value ?? ""));
          }}
        />
      ) : null}
    </div>
  );
});
