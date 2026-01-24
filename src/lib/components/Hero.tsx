import { Link } from "@tanstack/react-router";
import { Button } from "~/lib/components/ui/button";
import { useAuthUser } from "~/lib/store/auth";
import * as m from "~/paraglide/messages";

export function Hero() {
  const user = useAuthUser();

  return (
    <section className="flex flex-col items-center justify-center gap-12 py-20 text-center">
      <div className="flex max-w-3xl flex-col items-center gap-7">
        <div className="flex flex-wrap justify-center gap-2">
          {[m.feature_any_language(), m.feature_ai_chat(), m.feature_vocabulary()].map(
            (label) => (
              <span
                key={label}
                className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur"
              >
                {label}
              </span>
            ),
          )}
        </div>

        <h1 className="type-display text-foreground">
          {m.hero_title_start()}{" "}
          <span className="relative inline-block whitespace-nowrap">
            <span className="relative z-10 text-primary">{m.hero_title_highlight()}</span>
            <span
              aria-hidden="true"
              className="absolute -inset-x-2 bottom-1 h-3 rounded-full bg-primary/15"
            />
          </span>
        </h1>

        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          {m.hero_description()}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {user ? (
            <Button asChild size="lg" className="px-7">
              <Link to="/library" search={{ page: 1 }}>
                {m.hero_start_learning()}
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="px-7">
              <Link to="/signin">{m.hero_get_started()}</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="w-full max-w-3xl">
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-6 text-left shadow-sm backdrop-blur">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-secondary/70 blur-3xl"
          />

          <div className="relative space-y-3 text-sm leading-relaxed">
            <div className="flex flex-col gap-3">
              <div className="w-fit max-w-[85%] rounded-2xl bg-secondary/60 px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground">You</p>
                <p className="mt-1 text-sm text-foreground">{m.screenshot_caption()}</p>
              </div>

              <div className="ml-auto w-fit max-w-[85%] rounded-2xl bg-primary/10 px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {m.app_name_part1()}
                  {m.app_name_part2()}
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {m.screenshot_interactive()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
