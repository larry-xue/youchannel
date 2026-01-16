import * as m from "~/paraglide/messages";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";

const faqs = () => [
  {
    question: m.faq_q1(),
    answer: m.faq_a1(),
  },
  {
    question: m.faq_q2(),
    answer: m.faq_a2(),
  },
  {
    question: m.faq_q3(),
    answer: m.faq_a3(),
  },
  {
    question: m.faq_q4(),
    answer: m.faq_a4(),
  },
];

export function FAQ() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="mb-6 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
          {m.faq_title()}
        </h2>
        <p className="mb-16 mx-auto max-w-2xl text-lg text-muted-foreground/90">
          {m.faq_subtitle()}
        </p>
      </div>

      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="flex flex-col gap-4">
          {faqs().map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="rounded-2xl border border-border/50 bg-surface-container-high/30 px-6"
            >
              <AccordionTrigger className="py-6 text-left text-lg font-medium hover:no-underline hover:text-primary transition-colors [&[data-state=open]]:text-primary">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-muted-foreground pb-6">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
