import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const features = [
  {
    title: "Save and sync playlists",
    description:
      "Add the videos you love and let the system keep everything updated.",
  },
  {
    title: "Talk to the video",
    description:
      "Ask questions and explore the details without scrubbing the timeline.",
  },
  {
    title: "Wiki and summaries",
    description:
      "See key terms, wiki links, and concise takeaways for fast review.",
  },
  {
    title: "Multilingual role-play",
    description:
      "Practice in your target language with guided conversations and scenarios.",
  },
];

export function Features() {
  return (
    <section className="grid animate-rise gap-4 pb-20 md:grid-cols-2">
      {features.map((feature, index) => (
        <Card
          key={feature.title}
          className="animate-rise"
          style={{ animationDelay: `${index * 120}ms` }}
        >
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
