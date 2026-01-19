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
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    blue: { bg: "bg-chart-1/10", text: "text-chart-1", ring: "ring-chart-1/20" },
    red: {
      bg: "bg-destructive/10",
      text: "text-destructive",
      ring: "ring-destructive/20",
    },
    amber: { bg: "bg-chart-2/10", text: "text-chart-2", ring: "ring-chart-2/20" },
    emerald: {
      bg: "bg-chart-3/10",
      text: "text-chart-3",
      ring: "ring-chart-3/20",
    },
  };

  const colors = colorMap[colorClass] || colorMap.blue;

  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/30 px-4 py-16 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="relative mb-6">
        <div
          className={`absolute inset-0 animate-pulse rounded-full ${colors.bg} blur-2xl opacity-50`}
        />
        <div
          className={`relative flex h-24 w-24 items-center justify-center rounded-[28px] ${colors.bg} shadow-sm ring-1 ${colors.ring}`}
        >
          <span className="text-5xl drop-shadow-sm">{emoji}</span>
        </div>
      </div>

      <h3 className="mb-2 font-display text-2xl font-semibold text-foreground tracking-tight">
        {title}
      </h3>
      <p className="mb-8 max-w-sm text-balance text-base text-muted-foreground">
        {description}
      </p>

      <Button
        size="lg"
        onClick={activeAction.onClick}
        disabled={activeAction.isLoading}
        className="h-12 rounded-full px-8 text-base font-medium shadow-md transition-[box-shadow,scale] hover:shadow-lg hover:shadow-primary/20 active:scale-95"
      >
        {activeAction.isLoading ? (
          <>
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
            {activeAction.loadingText || m.empty_video_loading()}
          </>
        ) : (
          activeAction.label
        )}
      </Button>
    </div>
  );
}
