import { Link } from "@tanstack/react-router";
import { useAuthUser } from "~/lib/store/auth";
import * as m from "~/paraglide/messages";
import { Button } from "./ui/button";

export function Hero() {
  const user = useAuthUser();
  return (
    <section className="grid animate-rise gap-12 py-12 lg:grid-cols-[1fr_1fr] lg:items-center lg:py-24">
      <div className="space-y-10">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary shadow-xs">
            {m.hero_badge()}
          </div>
          <h1 className="font-display text-4xl font-extrabold leading-[1.15] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
            {m.hero_title_start()}{" "}
            <span className="bg-linear-to-r from-primary to-amber-600 bg-clip-text text-transparent">
              {m.hero_title_highlight()}
            </span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground leading-relaxed md:text-xl">
            {m.hero_description()}
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          {user ? (
            <Button
              asChild
              size="lg"
              className="h-14 rounded-full px-8 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-primary/30 active:scale-95"
            >
              <Link to="/library" search={{ page: 1 }}>
                {m.hero_start_learning()}
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              size="lg"
              className="h-14 rounded-full px-8 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-primary/30 active:scale-95"
            >
              <Link to="/signin">{m.hero_get_started()}</Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-6 pt-2 text-sm font-medium text-muted-foreground">
          <div className="flex items-center gap-2 rounded-full bg-surface-container-high/50 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            {m.feature_any_language()}
          </div>
          <div className="flex items-center gap-2 rounded-full bg-surface-container-high/50 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            {m.feature_ai_chat()}
          </div>
          <div className="flex items-center gap-2 rounded-full bg-surface-container-high/50 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
            {m.feature_vocabulary()}
          </div>
        </div>
      </div>

      <div className="relative isolate pt-8 lg:pt-0">
        <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-primary/10 via-amber-100/5 to-transparent blur-3xl dark:via-amber-900/10" />

        <div className="relative overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-border/50 transition-all hover:ring-primary/20">
          <div className="aspect-[16/10] bg-muted/30 p-2 sm:p-4">
            {/* Window Controls */}
            <div className="mb-4 flex gap-2 px-2">
              <div className="h-3 w-3 rounded-full bg-red-500/20" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/20" />
              <div className="h-3 w-3 rounded-full bg-green-500/20" />
            </div>

            <div className="flex h-full w-full flex-col items-center justify-center rounded-xl bg-surface-container/50 text-center text-muted-foreground ring-1 ring-border/20 backdrop-blur-sm">
              <div className="p-8">
                <div className="mb-6 scale-150 text-6xl drop-shadow-sm">📺 💬</div>
                <p className="mb-2 text-xl font-semibold text-foreground">
                  {m.screenshot_interactive()}
                </p>
                <p className="text-sm opacity-80">{m.screenshot_caption()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
