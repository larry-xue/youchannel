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
    <section className="mx-auto max-w-4xl py-16 lg:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="mb-6 type-h2 text-foreground">{m.faq_title()}</h2>
        <p className="mb-16 type-body">{m.faq_subtitle()}</p>
      </div>

      <div className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible className="flex flex-col gap-4">
          {faqs().map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="rounded-3xl border border-border/40 bg-surface-container/30 px-6 transition-[background-color,border-color,box-shadow] hover:bg-surface-container/50"
            >
              <AccordionTrigger className="py-6 text-left text-lg font-semibold hover:no-underline hover:text-primary transition-colors [&[data-state=open]]:text-primary">
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
