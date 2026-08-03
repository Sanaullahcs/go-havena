import { Icon } from "../icons/Icon";

const DASHBOARD_SRC = "/landing/dashboard-mockup.png";

export function DashboardMockup({ className = "" }: { className?: string }) {
  return (
    <div className={`product-mockup-browser-wrap relative w-full ${className}`}>
      <div className="product-mockup-browser overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-[0_20px_50px_-16px_rgba(15,23,42,0.2)]">
        <div className="flex items-center gap-2 border-b border-border-subtle bg-[#f1f5f9] px-3 py-2">
          <div className="flex shrink-0 gap-1">
            <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
            <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
            <span className="h-2 w-2 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[9px] text-ink-muted ring-1 ring-border-subtle sm:text-[10px]">
            <Icon name="lock" className="h-2.5 w-2.5 shrink-0 text-emerald-600" />
            <span className="truncate">havena.app/admin</span>
          </div>
        </div>

        <div className="bg-[#f8fafc]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={DASHBOARD_SRC}
            alt="Havena community admin dashboard with activity charts and member stats"
            width={1400}
            height={788}
            className="product-mockup-img block h-auto w-full"
            loading="eager"
            decoding="sync"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

export default DashboardMockup;
