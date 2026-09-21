"use client";

import { useState } from "react";
import { Container } from "../ui/Container";
import { Icon } from "../icons/Icon";

const FAQS = [
  {
    question: "Who pays for Havena?",
    answer:
      "The community admin buys a subscription with a seat pack. Residents never pay Havena — they join through invites or approval and use the app free under your plan.",
  },
  {
    question: "What is a seat?",
    answer:
      "One approved resident uses one seat. Guests do not count. When seats are full, upgrade your plan from Billing before inviting or approving more residents.",
  },
  {
    question: "How do community admins get started?",
    answer:
      "Start from the website, verify with phone OTP, set up your community, choose a subscription, then invite residents by code, QR, or approval queue.",
  },
  {
    question: "Do admins need a separate tool from residents?",
    answer:
      "Admins use the web dashboard for billing, invites, and operations. Residents use the mobile app for notices, events, amenities, wellness, and neighborhood life.",
  },
  {
    question: "Is Havena only for HOAs?",
    answer:
      "Havena is built for HOAs, property managers, and neighborhood associations that need verified membership and day-to-day community operations in one place.",
  },
  {
    question: "Can we change plans later?",
    answer:
      "Yes. Upgrade anytime from Billing. Downgrades are allowed only when your used seats still fit the new plan’s seat limit.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="lp-section lp-faq scroll-mt-28">
      <Container size="xl">
        <div className="lp-faq__layout">
          <div className="lp-faq__intro">
            <p className="lp-label lp-label--plain">FAQ</p>
            <h2 className="lp-faq__title">Questions communities ask before they switch</h2>
            <p className="lp-body lp-faq__lede">
              Straight answers about verification, admin control, and what life looks like after
              your neighborhood moves onto Havena.
            </p>
          </div>

          <ul className="lp-faq__list">
            {FAQS.map((item, index) => {
              const isOpen = openIndex === index;

              return (
                <li key={item.question} className="lp-faq__item">
                  <button
                    type="button"
                    className="lp-faq__trigger"
                    aria-expanded={isOpen}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                  >
                    <span className="lp-faq__question">{item.question}</span>
                    <span className={`lp-faq__icon${isOpen ? " is-open" : ""}`} aria-hidden="true">
                      <Icon name="chevron-down" className="h-4 w-4" />
                    </span>
                  </button>
                  <div className={`lp-faq__panel${isOpen ? " is-open" : ""}`}>
                    <div className="lp-faq__panel-inner">
                      <p className="lp-faq__answer">{item.answer}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </section>
  );
}

export default FAQ;
