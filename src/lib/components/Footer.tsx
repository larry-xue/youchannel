import * as m from "~/paraglide/messages";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background/50 py-12 backdrop-blur-sm">
      <div className="container mx-auto max-w-[1440px] px-6 text-center text-xs font-medium text-muted-foreground/80">
        {m.footer_text()}
      </div>
    </footer>
  );
}
