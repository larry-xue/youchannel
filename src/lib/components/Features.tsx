import * as m from "~/paraglide/messages";

const features = () => [
  {
    title: m.features_title_1(),
    description: m.features_desc_1(),
  },
  {
    title: m.features_title_2(),
    description: m.features_desc_2(),
  },
  {
    title: m.features_title_3(),
    description: m.features_desc_3(),
  },
  {
    title: m.features_title_4(),
    description: m.features_desc_4(),
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-3xl py-12">
      <div className="mb-8 text-center">
        <h2 className="type-h2 text-foreground">Why choose Fluently?</h2>
      </div>
      <div className="grid gap-4">
        {features().map((feature) => (
          <div
            key={feature.title}
            className="rounded-2xl border border-border/60 bg-card px-5 py-4"
          >
            <p className="text-sm font-semibold text-foreground">{feature.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
