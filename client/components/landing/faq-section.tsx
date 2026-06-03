"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

const faqs = [
  {
    question: "What currencies can customers pay in?",
    answer: "Customers pay in supported local currencies such as NGN, KES, and GHS.",
  },
  {
    question: "What do merchants settle in?",
    answer: "Merchants settle in Stellar USDC after the release window.",
  },
  {
    question: "Do customers need crypto wallets?",
    answer: "No. Customers use a local payment flow while Renew handles settlement behind the scenes.",
  },
  {
    question: "How does checkout work?",
    answer: "Create a collection, send the checkout URL, and listen for the paid event before fulfilling.",
  },
  {
    question: "When does settlement release?",
    answer: "Renew schedules release for the next day and can hold settlement if a payment issue is reported before release.",
  },
] as const;

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  return (
    <section className="py-14 sm:py-16 lg:py-20">
      <Container>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-start">
          <Reveal offset={22}>
            <h2 className="max-w-[10ch] font-display text-[clamp(2.8rem,6vw,4.8rem)] leading-[0.92] tracking-[-0.06em] text-[#111111]">
              <span>Got Questions?</span>
              <span className="hero-image-text block">Here are some answers!</span>
            </h2>
          </Reveal>

          <div className="grid gap-2">
            {faqs.map((item, index) => (
              <Reveal key={item.question} offset={14} delay={index * 0.04}>
                <div
                  className={cn(
                    "overflow-hidden rounded-lg border bg-white transition-colors",
                    openIndex === index ? "border-[#cfdccc]" : "border-[#dfe9dd]"
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={openIndex === index}
                    aria-controls={`faq-answer-${index}`}
                    onClick={() => setOpenIndex((current) => (current === index ? null : index))}
                    className="flex w-full items-center justify-between gap-5 px-5 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f7d3c]"
                  >
                    <span className="text-base font-semibold tracking-[-0.03em] text-[#111111]">
                      {item.question}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-[#66706a] transition-transform duration-300",
                        openIndex === index && "rotate-180"
                      )}
                      strokeWidth={2.1}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {openIndex === index ? (
                      <motion.div
                        id={`faq-answer-${index}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          duration: shouldReduceMotion ? 0 : 0.28,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="overflow-hidden"
                      >
                        <p className="max-w-[44rem] px-5 pb-5 text-sm leading-6 text-[#66706a]">
                          {item.answer}
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
