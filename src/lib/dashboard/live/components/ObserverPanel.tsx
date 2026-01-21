import { memo } from "react";
import { Button } from "~/lib/components/ui/button";
import { ScrollArea } from "~/lib/components/ui/scroll-area";
import { cn } from "~/lib/utils";
import type { ObserverOutput } from "~/lib/dashboard/live/useObserverInsights";

type ObserverPanelProps = {
  outputs: ObserverOutput[];
  error: unknown;
  canTrigger: boolean;
  onTrigger: () => void;
};

export const ObserverPanel = memo(function ObserverPanel({
  outputs,
  error,
  canTrigger,
  onTrigger,
}: ObserverPanelProps) {
  const hasOutputs = outputs.length > 0;

  return (
    <aside
      className={cn(
        "hidden lg:flex col-span-1 min-w-[320px] max-w-[420px] flex-col",
        "rounded-2xl border border-border/60 bg-card p-4",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Observer Agent</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onTrigger} disabled={!canTrigger}>
            Run
          </Button>
        </div>
      </div>

      {error instanceof Error && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "mt-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive",
          )}
        >
          {error.message}
        </div>
      )}

      <ScrollArea className="flex-1 mt-3 -mr-3 pr-3">
        <div className="space-y-2 pb-2">
          {!hasOutputs && (
            <div
              className={cn(
                "rounded-xl border border-border/60 bg-card p-3 text-xs text-muted-foreground",
              )}
            >
              No insights yet. Run the observer to generate notes.
            </div>
          )}
          {outputs.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "rounded-xl border border-border/60 bg-card p-3 overflow-auto break-words",
              )}
            >
              {entry.explanation && entry.explanation.length > 0 && (
                <div className="mt-3 space-y-2">
                  {entry.explanation.map((item) => {
                    const itemKey = `${entry.id}-${item.term}-${item.example}`;
                    return (
                      <div
                        key={itemKey}
                        className="bg-muted/30 rounded-lg p-2 text-xs"
                      >
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-foreground">
                            {item.term}
                          </span>
                          <span className="text-muted-foreground">-</span>
                          <span className="text-foreground/90">{item.note}</span>
                        </div>
                        <div className="mt-1 text-muted-foreground/80 italic break-words">
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
      </ScrollArea>
    </aside>
  );
});
