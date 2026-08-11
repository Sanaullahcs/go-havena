import { Button } from "../ui/Button";
import { Container } from "../ui/Container";
import { actionLinks } from "@/lib/landing/site";

const STEPS = [
  {
    num: "01",
    title: "Start your community",
    body: "Sign up as a community admin with phone OTP and set up your neighborhood details.",
  },
  {
    num: "02",
    title: "Choose a subscription",
    body: "Pick a seat pack that fits your size. One plan covers the whole community.",
  },
  {
    num: "03",
    title: "Invite residents",
    body: "Share invite codes or approve join requests. Residents use the app free — no payment from them.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="lp-section lp-process scroll-mt-28">
      <Container size="xl">
        <div className="lp-process__head">
          <p className="lp-label lp-label--on-dark">How it works</p>
          <h2 className="lp-title lp-title--on-dark">Three steps. Then the neighborhood runs itself.</h2>
          <p className="lp-body lp-process__lede">
            You buy the seats. Residents join free. Operations stay in one place.
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
            Start your community
          </Button>
          <a
            href="#pricing"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/35 px-6 text-[15px] font-semibold text-white transition hover:bg-white/10"
          >
            See plans
          </a>
        </div>
      </Container>
    </section>
  );
}

export default HowItWorks;
