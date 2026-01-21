import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import * as m from "~/paraglide/messages";
import { Button } from "./ui/button";

export function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="mx-auto max-w-md text-center">
        <p className="text-sm text-muted-foreground">{m.not_found_404()}</p>
        <h1 className="mt-3 text-lg font-semibold text-foreground">
          {m.not_found_title()}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {m.not_found_message()}
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button type="button" onClick={() => window.history.back()}>
            <ArrowLeft className="size-4" />
            {m.not_found_go_back()}
          </Button>
          <Button asChild variant="outline">
            <Link to="/">{m.not_found_back_home()}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
