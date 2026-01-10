import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

import * as m from "~/paraglide/messages";

const features = () => [
  {
    title: m.features_title_1(),
    description: m.features_desc_1(),
    icon: "🌍",
  },
  {
    title: m.features_title_2(),
    description: m.features_desc_2(),
    icon: "💬",
  },
  {
    title: m.features_title_3(),
    description: m.features_desc_3(),
    icon: "🎭",
  },
  {
    title: m.features_title_4(),
    description: m.features_desc_4(),
    icon: "📺",
  },
];

export function Features() {
  return (
    <section className="grid animate-rise gap-4 pb-20 md:grid-cols-2">
      {features().map((feature, index) => (
        <Card
          key={feature.title}
          className="animate-rise"
          style={{ animationDelay: `${index * 120}ms` }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span>{feature.icon}</span>
              <span>{feature.title}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            {feature.description}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
