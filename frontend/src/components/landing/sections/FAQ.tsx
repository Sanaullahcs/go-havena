"use client";

import { useState } from "react";
import { Container } from "../ui/Container";
import { Icon } from "../icons/Icon";

const FAQS = [
  {
    question: "Who can join a community on Havena?",
    answer:
      "Only verified residents and approved admins for a specific neighborhood or HOA. There is no public sign-up feed. Each person selects their community, completes verification, and waits for admin approval before gaining access.",
  },
  {
    question: "How does member verification work?",
    answer:
      "Residents sign in with OTP, complete their profile, and upload a utility bill or proof of address. Community admins review submissions from the dashboard and approve or decline access from one queue.",
  },
  {
    question: "Do admins need a separate tool from residents?",
    answer:
      "No. Admins and residents can both use the mobile app. When deeper operations are needed, admins also have a web dashboard for approvals, publishing, analytics, and community management.",
  },
  {
    question: "Is Havena only for HOAs?",
    answer:
      "Havena is built for HOAs, property managers, and neighborhood associations that need verified membership, daily operations, and resident engagement in one calm platform.",
  },
  {
    question: "What can residents do in the app?",
    answer:
      "Residents can read notices, RSVP to events, book amenities, join wellness programs, browse local deals, and stay connected to neighborhood life without scattered group chats or email threads.",
  },
  {
    question: "How fast can a community get started?",
    answer:
      "Most communities can invite admins, configure access, and start approving members within a single setup session. Residents typically reach their first login in minutes after approval.",
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
                    <p className="lp-faq__answer">{item.answer}</p>
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
