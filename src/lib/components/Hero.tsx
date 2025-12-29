import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface HeroProps {
  user: any | null;
}

export function Hero({ user }: HeroProps) {
  return (
    <section className="grid animate-rise gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          YouTube + Gemini
        </p>
        <h1 className="font-display text-4xl font-semibold leading-tight text-foreground md:text-5xl">
          Turn channel videos into searchable insights.
        </h1>
        <p className="text-base text-muted-foreground">
          Connect your YouTube account, keep videos in sync, and chat across
          one or multiple analyses powered by Gemini.
        </p>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <Button asChild size="lg">
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link to="/signin" search={{ error: "", redirect: "/" }}>
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
          <span className="rounded-full bg-muted/40 px-3 py-1">OAuth channel sync</span>
          <span className="rounded-full bg-muted/40 px-3 py-1">Prompted analysis</span>
          <span className="rounded-full bg-muted/40 px-3 py-1">Multi-video chat</span>
        </div>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Channel heartbeat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Uploads synced</span>
              <span className="text-foreground">24</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Analyses ready</span>
              <span className="text-foreground">18</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last sync</span>
              <span className="text-foreground">2 hours ago</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sample insight</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Gemini highlights the top 3 segments, key audience questions, and
            suggested follow-up topics for your next upload.
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
