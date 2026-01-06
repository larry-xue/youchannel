import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const features = [
  {
    title: "Master Many Languages",
    description:
      "Learning Spanish and Japanese? No problem. FluentBy.ai supports any language available on YouTube.",
    icon: "🌍",
  },
  {
    title: "Chat with Videos",
    description:
      "Don't just watch—interact. Have a conversation with the video characters or the content itself.",
    icon: "💬",
  },
  {
    title: "Role-Play Scenarios",
    description:
      "Step into the scene. Practice real-world conversations simulated from the video context.",
    icon: "🎭",
  },
  {
    title: "Import from Playlists",
    description:
      "Your content, your choice. Select any video from your YouTube playlists to start learning immediately.",
    icon: "📺",
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
