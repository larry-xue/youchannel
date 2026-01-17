import * as m from "~/paraglide/messages";

export function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background/50 backdrop-blur-sm transition-[opacity,background-color,backdrop-filter] duration-500">
      <div className="flex flex-col items-center gap-6" role="status">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-lg shadow-primary/10" />
          {/* Inner dot for extra detail */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-primary/50 animate-pulse" />
          </div>
        </div>
        <p className="text-base font-medium tracking-tight text-muted-foreground animate-pulse">
          {m.full_page_loading()}
        </p>
      </div>
    </div>
  );
}
