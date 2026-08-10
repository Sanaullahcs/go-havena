import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { actionLinks } from "@/lib/landing/site";

const STEPS = [
  {
    num: "01",
    title: "Create your account",
    body: "Sign in with OTP, choose resident or admin, and select your community.",
  },
  {
    num: "02",
    title: "Verify & get approved",
    body: "Complete your profile, upload a utility bill, and wait for admin approval.",
  },
  {
    num: "03",
    title: "Live in the neighborhood",
    body: "Access notices, events, wellness, amenities, and local deals in one place.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="lp-section lp-process scroll-mt-28">
      <Container size="xl">
        <div className="lp-process__head">
          <p className="lp-label lp-label--on-dark">How it works</p>
          <h2 className="lp-title lp-title--on-dark">Three clear steps from invite to everyday use</h2>
          <p className="lp-body lp-process__lede">
            Simple onboarding for residents, with admins in control of who joins.
          </p>
        </div>

        <ol className="lp-process__steps">
          {STEPS.map((step) => (
            <li key={step.num} className="lp-process__step">
              <article className="lp-process__card">
                <span className="lp-process__num">{step.num}</span>
                <h3 className="lp-process__title">{step.title}</h3>
                <p className="lp-process__body">{step.body}</p>
              </article>
            </li>
          ))}
        </ol>

        <div className="lp-process__cta">
          <Button href={actionLinks.signUp} variant="white" size="lg" iconTrailing="arrow-right">
            Get started now
          </Button>
        </div>
      </Container>
    </section>
  );
}

export default HowItWorks;
