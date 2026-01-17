import { Link } from "@tanstack/react-router";
import { useAuthUser } from "~/lib/store/auth";
import * as m from "~/paraglide/messages";
import { Button } from "./ui/button";

export function Hero() {
  const user = useAuthUser();
  return (
    <section className="flex flex-col items-center justify-center gap-16 py-16 text-center animate-rise lg:py-24">
      <div className="flex max-w-3xl flex-col items-center space-y-8">
        <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-semibold text-primary shadow-sm backdrop-blur-sm">
          {m.hero_badge()}
        </div>

        <h1 className="type-display text-foreground">
          {m.hero_title_start()}{" "}
          <span className="bg-linear-to-r from-primary to-amber-600 bg-clip-text text-transparent">
            {m.hero_title_highlight()}
          </span>
        </h1>

        <p className="max-w-2xl text-lg text-muted-foreground/90 leading-relaxed md:text-xl">
          {m.hero_description()}
        </p>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {user ? (
            <Button
              asChild
              size="lg"
              className="h-14 rounded-full px-10 text-base font-bold shadow-xl shadow-primary/20 transition-[background-color,color,border-color,box-shadow,translate,scale,rotate] hover:scale-105 hover:shadow-2xl hover:shadow-primary/30 active:scale-95"
            >
              <Link to="/library" search={{ page: 1 }}>
                {m.hero_start_learning()}
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              size="lg"
              className="h-14 rounded-full px-10 text-base font-bold shadow-xl shadow-primary/20 transition-[background-color,color,border-color,box-shadow,translate,scale,rotate] hover:scale-105 hover:shadow-2xl hover:shadow-primary/30 active:scale-95"
            >
              <Link to="/signin">{m.hero_get_started()}</Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-6 pt-4 text-sm font-medium text-muted-foreground">
          <div className="flex items-center gap-2 rounded-full bg-surface-container-high/30 border border-border/40 px-4 py-1.5 backdrop-blur-sm">
            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            {m.feature_any_language()}
          </div>
          <div className="flex items-center gap-2 rounded-full bg-surface-container-high/30 border border-border/40 px-4 py-1.5 backdrop-blur-sm">
            <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            {m.feature_ai_chat()}
          </div>
          <div className="flex items-center gap-2 rounded-full bg-surface-container-high/30 border border-border/40 px-4 py-1.5 backdrop-blur-sm">
            <div className="h-2 w-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
            {m.feature_vocabulary()}
          </div>
        </div>
      </div>

      <div className="relative w-full max-w-5xl px-4">
        <div className="absolute -inset-4 -z-10 rounded-[3rem] bg-gradient-to-tr from-primary/20 via-amber-100/10 to-transparent blur-3xl dark:via-amber-900/20" />

        <div className="relative overflow-hidden rounded-3xl bg-surface-container/40 shadow-2xl ring-1 ring-border/50 backdrop-blur-md transition-[box-shadow,background-color,border-color] hover:ring-primary/20">
          <div className="aspect-[21/9] bg-muted/20 p-4 sm:p-6 flex items-center justify-center">
            <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl bg-surface-container/60 text-center text-muted-foreground ring-1 ring-border/20 backdrop-blur-sm p-8 sm:p-12">
              <div className="mb-6 scale-150 text-7xl drop-shadow-sm motion-safe:animate-bounce motion-reduce:animate-none motion-safe:[animation-duration:3s]">
                📺
              </div>
              <p className="mb-3 text-2xl font-bold text-foreground">
                {m.screenshot_interactive()}
              </p>
              <p className="text-base font-medium opacity-80">{m.screenshot_caption()}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
