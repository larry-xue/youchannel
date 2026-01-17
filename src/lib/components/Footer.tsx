import * as m from "~/paraglide/messages";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-surface-container/20 py-12 backdrop-blur-sm">
      <div className="container mx-auto max-w-7xl px-6 text-center text-sm font-medium text-muted-foreground/80">
        {m.footer_text()}
      </div>
    </footer>
  );
}
