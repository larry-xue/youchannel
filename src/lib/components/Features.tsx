import { cn } from "~/lib/utils";
import * as m from "~/paraglide/messages";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const features = () => [
  {
    title: m.features_title_1(),
    description: m.features_desc_1(),
    icon: "🌍",
    color: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
  {
    title: m.features_title_2(),
    description: m.features_desc_2(),
    icon: "💬",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    title: m.features_title_3(),
    description: m.features_desc_3(),
    icon: "🎭",
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    title: m.features_title_4(),
    description: m.features_desc_4(),
    icon: "📺",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
];

export function Features() {
  return (
    <section className="grid gap-6 sm:grid-cols-2 lg:gap-8">
      {features().map((feature, index) => (
        <Card
          key={feature.title}
          className={cn(
            "group relative overflow-hidden rounded-3xl border-border/50 bg-surface-container/50 p-2 transition-all duration-300",
            "hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5 hover:ring-1 hover:ring-primary/20",
            "animate-rise",
          )}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

          <CardHeader className="relative pb-2">
            <div
              className={cn(
                "mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl text-2xl",
                feature.color,
              )}
            >
              {feature.icon}
            </div>
            <CardTitle className="text-xl font-bold tracking-tight text-foreground">
              {feature.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="relative text-base text-muted-foreground/90">
            {feature.description}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
