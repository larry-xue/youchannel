import { QUICK_ACTIONS } from "../constants";

export function QuickActions() {
  return (
    <div className="rounded-3xl border border-border/60 bg-muted/40 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Quick Actions
      </p>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        {QUICK_ACTIONS.map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
