import { useNavigate } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "~/lib/components/ui/button";
import * as m from "~/paraglide/messages";

interface EmptyStateProps {
  title?: string;
  description?: string;
  emoji?: string;
  action?: {
    label: string;
    onClick: () => void;
    isLoading?: boolean;
    loadingText?: string;
  };
  colorClass?: string;
}

export function EmptyVideoState({
  title = m.empty_video_title(),
  description = m.empty_video_description(),
  emoji = "📺",
  action,
  colorClass = "blue",
}: EmptyStateProps) {
  const navigate = useNavigate();

  const defaultAction = {
    label: m.empty_video_action(),
    onClick: () => navigate({ to: "/playlists" }),
    isLoading: false,
    loadingText: "",
  };

  const activeAction = { ...defaultAction, ...action };

  // Map color names to tailwind classes
  const colorMap: Record<string, { bg: string }> = {
    blue: { bg: "bg-blue-500/20" },
    red: { bg: "bg-red-500/20" },
    amber: { bg: "bg-amber-500/20" },
    emerald: { bg: "bg-emerald-500/20" },
  };

  const colors = colorMap[colorClass] || colorMap.blue;

  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 bg-muted/20 px-4 py-16 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="relative mb-6">
        <div
          className={`absolute inset-0 animate-pulse rounded-full ${colors.bg} blur-xl`}
        />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-background to-muted shadow-xl ring-1 ring-border/50">
          <span className="text-4xl">{emoji}</span>
        </div>
      </div>

      <h3 className="mb-2 font-display text-xl font-semibold text-foreground">{title}</h3>
      <p className="mb-8 max-w-sm text-sm text-muted-foreground">{description}</p>

      <Button
        size="lg"
        onClick={activeAction.onClick}
        disabled={activeAction.isLoading}
        className="h-11 rounded-full px-8 shadow-lg transition-all hover:shadow-primary/25"
      >
        {activeAction.isLoading ? (
          <>
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            {activeAction.loadingText || m.empty_video_loading()}
          </>
        ) : (
          activeAction.label
        )}
      </Button>
    </div>
  );
}
