import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const features = [
  {
    title: "OAuth channel access",
    description:
      "Connect your YouTube account, choose an active channel, and keep metadata fresh.",
  },
  {
    title: "Prompted analyses",
    description:
      "Customize the default prompt and generate new analyses without repeating existing records.",
  },
];

export function Features() {
  return (
    <section className="grid animate-rise gap-4 pb-20 md:grid-cols-2">
      {features.map((feature, index) => (
        <Card key={feature.title} className="animate-rise" style={{ animationDelay: `${index * 120}ms` }}>
          <CardHeader>
            <CardTitle className="text-base">{feature.title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {feature.description}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
