import { Link } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";
import * as m from "~/paraglide/messages";
import { Button } from "./ui/button";

export function NotFound() {
  return (
    <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden px-4">
      {/* Decorative floating elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-pulse [animation-delay:1s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center max-w-lg mx-auto animate-rise">
        {/* 404 Display */}
        <div className="relative mb-8">
          <h1 className="font-display text-[10rem] sm:text-[12rem] font-bold leading-none tracking-tighter bg-gradient-to-br from-primary via-primary/80 to-accent-foreground bg-clip-text text-transparent select-none">
            {m.not_found_404()}
          </h1>
          <div
            className="absolute inset-0 font-display text-[10rem] sm:text-[12rem] font-bold leading-none tracking-tighter text-primary/10 blur-xl select-none"
            aria-hidden="true"
          >
            {m.not_found_404()}
          </div>
        </div>

        {/* Message */}
        <div className="space-y-3 mb-10">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">
            {m.not_found_title()}
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-md mx-auto leading-relaxed">
            {m.not_found_message()}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            type="button"
            size="lg"
            onClick={() => window.history.back()}
            className="w-full sm:w-auto group rounded-full shadow-lg hover:shadow-xl transition-shadow"
          >
            <ArrowLeft className="size-4 transition-[translate] group-hover:-translate-x-1" />
            {m.not_found_go_back()}
          </Button>
          <Button
            asChild
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto group rounded-full shadow-sm hover:shadow-md transition-shadow"
          >
            <Link to="/">
              <Home className="size-4" />
              {m.not_found_back_home()}
            </Link>
          </Button>
        </div>

        {/* Subtle divider */}
        {/* <div className="mt-10 pt-8 border-t border-border/50">
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Search className="size-4" />
            <span>Try searching or explore our content</span>
          </p>
        </div> */}
      </div>
    </div>
  );
}
