import { Loading } from "~/lib/components/ui/loading";

export function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <Loading />
      </div>
    </div>
  );
}
