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
    <section className="mx-auto max-w-3xl py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="mb-4 type-h2 text-foreground">{m.faq_title()}</h2>
        <p className="text-sm text-muted-foreground">{m.faq_subtitle()}</p>
      </div>

      <div className="mx-auto mt-10 max-w-3xl">
        <Accordion type="single" collapsible className="flex flex-col gap-4">
          {faqs().map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="rounded-2xl border border-border/60 bg-card px-5"
            >
              <AccordionTrigger className="py-5 text-left text-sm font-semibold hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground pb-5">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
