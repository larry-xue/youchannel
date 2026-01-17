import * as m from "~/paraglide/messages";

export function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background/50 backdrop-blur-sm transition-[opacity,background-color,backdrop-filter] duration-500">
      <div className="flex flex-col items-center gap-6" role="status">
        <div className="relative h-16 w-16">
          <img
            src="/loading.png"
            alt="Loading..."
            className="w-full h-full animate-spin"
          />
        </div>
        <p className="text-base font-medium tracking-tight text-muted-foreground animate-pulse">
          {m.full_page_loading()}
        </p>
      </div>
    </div>
  );
}
