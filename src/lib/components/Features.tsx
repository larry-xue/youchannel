import { Languages, ListVideo, MessageSquareText, Sparkles } from "lucide-react";
import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";

const features = () => [
  {
    title: m.features_title_1(),
    description: m.features_desc_1(),
    Icon: Languages,
    iconClassName:
      "bg-primary/15 text-primary ring-1 ring-primary/20 dark:ring-primary/25",
  },
  {
    title: m.features_title_2(),
    description: m.features_desc_2(),
    Icon: MessageSquareText,
    iconClassName:
      "bg-[color:var(--brand-blue)]/15 text-[color:var(--brand-blue)] ring-1 ring-[color:var(--brand-blue)]/20",
  },
  {
    title: m.features_title_3(),
    description: m.features_desc_3(),
    Icon: Sparkles,
    iconClassName:
      "bg-[color:var(--brand-green)]/15 text-[color:var(--brand-green)] ring-1 ring-[color:var(--brand-green)]/20",
  },
  {
    title: m.features_title_4(),
    description: m.features_desc_4(),
    Icon: ListVideo,
    iconClassName: "bg-secondary text-secondary-foreground ring-1 ring-border/60",
  },
];

export function Features() {
  return (
    <section id="how-it-works" className="mx-auto max-w-5xl py-14">
      <div className="mx-auto max-w-2xl text-center">
        <p className="type-label text-muted-foreground">Built for practice</p>
        <h2 className="mt-3 type-h2 text-foreground">Why choose Fluently?</h2>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {features().map((feature) => (
          <div
            key={feature.title}
            className={cn(
              "group relative overflow-hidden rounded-3xl border border-border/60",
              "bg-card/70 px-6 py-5 shadow-sm backdrop-blur",
              "transition-colors hover:bg-card/80",
            )}
          >
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                  feature.iconClassName,
                )}
              >
                <feature.Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{feature.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
