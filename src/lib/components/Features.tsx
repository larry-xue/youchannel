import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const features = () => [
  {
    title: m.features_title_1(),
    description: m.features_desc_1(),
    icon: "🌍",
    color: "bg-chart-2/10 text-chart-2",
  },
  {
    title: m.features_title_2(),
    description: m.features_desc_2(),
    icon: "💬",
    color: "bg-chart-1/10 text-chart-1",
  },
  {
    title: m.features_title_3(),
    description: m.features_desc_3(),
    icon: "🎭",
    color: "bg-chart-3/10 text-chart-3",
  },
  {
    title: m.features_title_4(),
    description: m.features_desc_4(),
    icon: "📺",
    color: "bg-chart-4/10 text-chart-4",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-5xl py-12 lg:py-24">
      <div className="mb-16 text-center">
        <h2 className="type-h2 text-foreground">Why choose Fluently?</h2>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
        {features().map((feature, index) => (
          <Card
            key={feature.title}
            className={cn(
              "group relative overflow-hidden rounded-[2rem] border-border/40 bg-card/30 p-2 transition-[background-color,border-color,box-shadow,translate,scale,rotate] duration-300",
              "hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 hover:ring-1 hover:ring-primary/20 hover:bg-card/50",
            )}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

            <CardHeader className="relative pb-2">
              <div
                className={cn(
                  "mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ring-1 ring-border/20 shadow-sm",
                  feature.color,
                )}
              >
                {feature.icon}
              </div>
              <CardTitle className="font-display text-xl font-bold tracking-tight text-foreground">
                {feature.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative text-base leading-relaxed text-muted-foreground">
              {feature.description}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
