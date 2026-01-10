import * as m from "~/paraglide/messages";

export function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="container mx-auto max-w-7xl px-6 text-xs text-muted-foreground">
        {m.footer_text()}
      </div>
    </footer>
  );
}
