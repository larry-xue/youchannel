import { useNavigate } from "@tanstack/react-router";
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
}

export function EmptyVideoState({
  title = m.empty_video_title(),
  description = m.empty_video_description(),
  emoji = "",
  action,
}: EmptyStateProps) {
  const navigate = useNavigate();

  const defaultAction = {
    label: m.empty_video_action(),
    onClick: () => navigate({ to: "/playlists" }),
    isLoading: false,
    loadingText: "",
  };

  const activeAction = { ...defaultAction, ...action };

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-card px-6 py-10 text-center">
      {emoji ? <div className="text-3xl">{emoji}</div> : null}
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>

      <Button
        onClick={activeAction.onClick}
        disabled={activeAction.isLoading}
        className="mt-6 px-5"
      >
        {activeAction.isLoading
          ? activeAction.loadingText || m.empty_video_loading()
          : activeAction.label}
      </Button>
    </div>
  );
}
