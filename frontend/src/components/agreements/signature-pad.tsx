"use client";

import { useEffect, useRef } from "react";

type Props = {
  disabled?: boolean;
  onChange?: (empty: boolean) => void;
};

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
};

export function AgreementSignaturePad({
  disabled,
  onChange,
  padRef,
}: Props & { padRef: React.MutableRefObject<SignaturePadHandle | null> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const emptyRef = useRef(true);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const syncHandle = () => {
    padRef.current = {
      isEmpty: () => emptyRef.current,
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
      clear: () => clearPad(),
    };
  };

  const paintContext = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.lineWidth = 2.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0F2744";
    return ctx;
  };

  const resize = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(1, wrap.clientWidth);
    const height = 180;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx?.clearRect(0, 0, width, height);
    emptyRef.current = true;
    onChange?.(true);
    syncHandle();
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(1, 0, 0, 1, 0, 0);
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    emptyRef.current = true;
    onChange?.(true);
    syncHandle();
  };

  useEffect(() => {
    resize();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      if (!emptyRef.current) return;
      resize();
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    syncHandle();
  });

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#FBFCFD]">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          Draw your legal signature
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={clearPad}
          className="text-[12px] font-semibold text-[#1B4F8A] hover:underline disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      <div ref={wrapRef} className="relative h-[180px] w-full">
        <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-dashed border-slate-200" />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={(event) => {
            if (disabled) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drawingRef.current = true;
            lastRef.current = point(event);
          }}
          onPointerMove={(event) => {
            if (!drawingRef.current || disabled) return;
            const canvas = canvasRef.current;
            const ctx = canvas ? paintContext(canvas) : null;
            const next = point(event);
            const last = lastRef.current;
            if (!ctx || !last) return;
            ctx.beginPath();
            ctx.moveTo(last.x, last.y);
            ctx.lineTo(next.x, next.y);
            ctx.stroke();
            lastRef.current = next;
            emptyRef.current = false;
            onChange?.(false);
            syncHandle();
          }}
          onPointerUp={() => {
            drawingRef.current = false;
            lastRef.current = null;
          }}
          onPointerLeave={() => {
            drawingRef.current = false;
            lastRef.current = null;
          }}
        />
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-center text-[11px] text-slate-400">
        Sign above using your finger, trackpad, or mouse
      </p>
    </div>
  );
}
