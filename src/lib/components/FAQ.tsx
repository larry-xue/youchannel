import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "./ui/accordion";

import * as m from "~/paraglide/messages";

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
        <section className="py-20">
            <div className="container mx-auto max-w-7xl px-6">
                <div className="mx-auto max-w-3xl text-center">
                    <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        {m.faq_title()}
                    </h2>
                    <p className="mb-12 text-lg text-muted-foreground">
                        {m.faq_subtitle()}
                    </p>
                </div>
                <div className="mx-auto max-w-2xl">
                    <Accordion type="single" collapsible className="w-full">
                        {faqs().map((faq, index) => (
                            <AccordionItem key={index} value={`item-${index}`}>
                                <AccordionTrigger className="text-left">
                                    {faq.question}
                                </AccordionTrigger>
                                <AccordionContent className="text-muted-foreground">
                                    {faq.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </div>
        </section>
    );
}
