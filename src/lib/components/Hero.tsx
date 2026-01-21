import { Link } from "@tanstack/react-router";
import { useAuthUser } from "~/lib/store/auth";
import * as m from "~/paraglide/messages";
import { Button } from "./ui/button";

export function Hero() {
  const user = useAuthUser();

  return (
    <section className="flex flex-col items-center justify-center gap-10 py-16 text-center">
      <div className="flex max-w-3xl flex-col items-center gap-6">
        <h1 className="type-display text-foreground">
          {m.hero_title_start()} {m.hero_title_highlight()}
        </h1>

        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          {m.hero_description()}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {user ? (
            <Button asChild className="px-5">
              <Link to="/library" search={{ page: 1 }}>
                {m.hero_start_learning()}
              </Link>
            </Button>
          ) : (
            <Button asChild className="px-5">
              <Link to="/signin">{m.hero_get_started()}</Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-6 pt-2 text-sm text-muted-foreground">
          <span>{m.feature_any_language()}</span>
          <span>{m.feature_ai_chat()}</span>
          <span>{m.feature_vocabulary()}</span>
        </div>
      </div>

      <div className="w-full max-w-3xl rounded-2xl border border-border/60 bg-card p-6 text-left">
        <div className="space-y-4 text-sm leading-relaxed">
          <div className="text-muted-foreground">
            <span className="font-semibold text-foreground">You</span>:{" "}
            {m.screenshot_caption()}
          </div>
          <div className="text-muted-foreground">
            <span className="font-semibold text-foreground">
              {m.app_name_part1()}
              {m.app_name_part2()}
            </span>
            : {m.screenshot_interactive()}
          </div>
        </div>
      </div>
    </section>
  );
}
