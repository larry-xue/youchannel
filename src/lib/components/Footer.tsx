import * as m from "~/paraglide/messages";

export function Footer() {
  return (
    <footer className="border-t border-border/60 py-8">
      <div className="container mx-auto max-w-6xl px-6 text-center text-sm text-muted-foreground">
        {m.footer_text()}
      </div>
    </footer>
  );
}
