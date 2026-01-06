import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "./ui/accordion";

const faqs = [
    {
        question: "Is FluentBy.ai suitable for complete beginners?",
        answer:
            "FluentBy.ai is optimized for intermediate to advanced learners who already have a basic grasp of the language. We focus on bridging the gap to fluency using authentic native content, which can be overwhelming for absolute beginners.",
    },
    {
        question: "What languages can I learn?",
        answer:
            "You can learn any language! Since our platform is built on top of YouTube, if you can find a video in that language with captions, you can learn it with FluentBy.ai.",
    },
    {
        question: "How does the 'Chat with Video' feature work?",
        answer:
            "Our AI analyzes the video's transcript and context to create an interactive comprehension experience. You can ask specific questions about what happened, request explanations of cultural nuances, or even role-play with characters from the video.",
    },
    {
        question: "Do I need a paid YouTube account?",
        answer:
            "No, you don't need a YouTube Premium account. FluentBy.ai works with standard YouTube videos available publicly.",
    },
];

export function FAQ() {
    return (
        <section className="py-20">
            <div className="container mx-auto max-w-7xl px-6">
                <div className="mx-auto max-w-3xl text-center">
                    <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        Frequently asked questions
                    </h2>
                    <p className="mb-12 text-lg text-muted-foreground">
                        Everything you need to know about mastering languages with FluentBy.ai.
                    </p>
                </div>
                <div className="mx-auto max-w-2xl">
                    <Accordion type="single" collapsible className="w-full">
                        {faqs.map((faq, index) => (
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
