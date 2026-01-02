import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useAuthUser } from "~/lib/store/auth";

export function Hero() {
  const user = useAuthUser();
  return (
    <section className="grid animate-rise gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          YouTube language studio
        </p>
        <h1 className="font-display text-4xl font-semibold leading-tight text-foreground md:text-5xl">
          Turn favorite YouTube videos into a multilingual classroom.
        </h1>
        <p className="text-base text-muted-foreground">
          Save videos to your learning playlist and keep them in sync. AI analysis
          lets you chat with the content, explore wiki links and summaries, practice
          in your target language, and role-play real scenarios.
        </p>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <Button asChild size="lg">
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link to="/signin" search={{ error: "", redirect: "/dashboard" }}>
                Get started
              </Link>
            </Button>
          )}
          {/* <Button variant="outline" size="lg" asChild>
            <a
              href="https://tanstack.com/ai/latest/docs/adapters/gemini"
              target="_blank"
              rel="noreferrer noopener"
            >
              Gemini adapter docs
            </a>
          </Button> */}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted/40 px-3 py-1">
            Auto-synced playlists
          </span>
          <span className="rounded-full bg-muted/40 px-3 py-1">
            Chat with video content
          </span>
          <span className="rounded-full bg-muted/40 px-3 py-1">
            Role-play practice
          </span>
        </div>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Learning modes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary/70" />
                <span>Collect videos into a focused study playlist.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary/70" />
                <span>Ask questions, dig deeper, and review key moments.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary/70" />
                <span>Get wiki links, summaries, and vocabulary highlights.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary/70" />
                <span>Practice in your target language with role-play.</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
