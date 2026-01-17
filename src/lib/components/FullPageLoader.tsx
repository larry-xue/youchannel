import { Loading } from "~/lib/components/ui/loading";
import * as m from "~/paraglide/messages";

export function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background/50 backdrop-blur-sm transition-[opacity,background-color,backdrop-filter] duration-500">
      <div className="flex flex-col items-center gap-6" role="status">
        <Loading size="lg" />
      </div>
    </div>
  );
}
