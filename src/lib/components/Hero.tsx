import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { useAuthUser } from "~/lib/store/auth";

export function Hero() {
  const user = useAuthUser();
  return (
    <section className="grid animate-rise gap-10 py-16 lg:grid-cols-[1fr_1fr] lg:items-center">
      <div className="space-y-8">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            🎉 For Intermediate+ Learners
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground md:text-6xl">
            Master any language with{" "}
            <span className="bg-linear-to-r from-red-600 to-red-500 bg-clip-text text-transparent">
              YouTube
            </span>
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            FluentBy.ai helps you bridge the gap to fluency. Turn your favorite
            content into interactive language lessons with AI-powered chat,
            summaries, and real-world practice.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          {user ? (
            <Button asChild size="lg" className="h-12 rounded-full px-8 text-base">
              <Link to="/library">Start Learning</Link>
            </Button>
          ) : (
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full px-8 text-base shadow-xl shadow-primary/20 transition-all hover:shadow-2xl hover:shadow-primary/30"
            >
              <Link to="/signin">
                Get Started for Free
              </Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-4 pt-4 text-sm font-medium text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Any Language
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            AI Chat & Roleplay
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            Contextual Vocabulary
          </div>
        </div>
      </div>

      <div className="relative isolate pt-10">
        <div className="absolute -inset-y-4 right-0 -z-10 w-full overflow-hidden rounded-3xl bg-gradient-to-b from-primary/5 to-transparent blur-3xl" />
        <div className="relative rounded-2xl bg-card p-2 shadow-2xl ring-1 ring-border/50">
          <div className="aspect-16/10 overflow-hidden rounded-xl bg-muted/50">
            {/* Placeholder for Product Screenshot */}
            <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-900/5 text-center text-muted-foreground">
              <div className="p-8">
                <div className="mb-4 text-4xl">📺 💬</div>
                <p className="font-semibold">Interactive Video Chat</p>
                <p className="text-xs">
                  Ask questions about the video content directly
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
