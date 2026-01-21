import { memo } from "react";
import { Button } from "~/lib/components/ui/button";
import { cn } from "~/lib/utils";
import type { ObserverOutput } from "~/lib/dashboard/live/useObserverInsights";

type ObserverPanelProps = {
  outputs: ObserverOutput[];
  error: unknown;
  canTrigger: boolean;
  onTrigger: () => void;
  className?: string;
};

export const ObserverPanel = memo(function ObserverPanel({
  outputs,
  error,
  canTrigger,
  onTrigger,
  className,
}: ObserverPanelProps) {
  const hasOutputs = outputs.length > 0;

  return (
    <aside className={cn("hidden xl:flex flex-col gap-4 text-sm w-80 shrink-0 border-l border-border/60 bg-background sticky top-0 h-screen py-4 px-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Observer
        </p>
        <Button size="sm" variant="ghost" onClick={onTrigger} disabled={!canTrigger}>
          Run
        </Button>
      </div>

      {error instanceof Error && (
        <div role="status" aria-live="polite" className="text-xs text-destructive">
          {error.message}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="space-y-3 pb-2">
          {!hasOutputs && (
            <p className="text-xs text-muted-foreground">
              No insights yet. Run the observer to generate notes.
            </p>
          )}
          {outputs.map((entry) => (
            <div key={entry.id} className="space-y-3 break-words">
              {entry.explanation && entry.explanation.length > 0 && (
                <div className="space-y-2">
                  {entry.explanation.map((item) => {
                    const itemKey = `${entry.id}-${item.term}-${item.example}`;
                    return (
                      <div key={itemKey} className="border-l border-border/60 pl-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {item.term}
                        </div>
                        <div className="mt-1 text-xs text-foreground">
                          {item.note}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          "{item.example}"
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
});
