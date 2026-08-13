import { Icon } from "../icons/Icon";
import { HavenaDashboardPreview } from "./HavenaDashboardPreview";

export function DashboardMockup({ className = "" }: { className?: string }) {
  return (
    <div className={`lp-browser-mockup ${className}`.trim()}>
      <div className="lp-browser-mockup__chrome">
        <div className="lp-browser-mockup__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="lp-browser-mockup__url">
          <Icon name="lock" className="h-2.5 w-2.5 shrink-0 text-emerald-600" />
          <span>havena.app/admin</span>
        </div>
      </div>
      <div className="lp-browser-mockup__body">
        <HavenaDashboardPreview />
      </div>
    </div>
  );
}

export default DashboardMockup;
