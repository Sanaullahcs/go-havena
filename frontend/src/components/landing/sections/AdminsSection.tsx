import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { DashboardMockup } from "../ui/DashboardMockup";
import { Reveal } from "../ui/Reveal";
import { Icon } from "../icons/Icon";
import { adminBullets } from "@/lib/landing/content";
import { actionLinks } from "@/lib/landing/site";

export function AdminsSection() {
  return (
    <section id="admins" className="lp-section lp-audience lp-audience--admin scroll-mt-28">
      <Container size="xl">
        <div className="lp-audience__grid lp-audience__grid--reverse">
          <Reveal className="lp-audience__copy">
            <p className="lp-label lp-label--plain">For community admins</p>
            <h2 className="lp-title">Run your community with confidence.</h2>
            <p className="lp-body lp-audience__lede">
              The web dashboard gives operators full control — member approvals, content
              moderation, marketplace management, and engagement insights.
            </p>

            <ul className="lp-audience__list">
              {adminBullets.map((point) => (
                <li key={point}>
                  <Icon name="check-circle-2" className="h-4 w-4 shrink-0 text-brand" />
                  {point}
                </li>
              ))}
            </ul>

            <div className="lp-audience__actions">
              <Button
                href={actionLinks.signUp}
                variant="primary"
                size="lg"
                iconTrailing="arrow-right"
              >
                Request admin access
              </Button>
              <Button href={actionLinks.login} variant="secondary" size="lg">
                Admin sign in
              </Button>
            </div>
          </Reveal>

          <Reveal className="lp-audience__visual" delay={100}>
            <DashboardMockup />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

export default AdminsSection;
