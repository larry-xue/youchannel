import type { KeyboardEvent } from "react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/lib/components/ui/tooltip";
import type { VideoWithStatus } from "~/lib/dashboard/data";
import * as m from "~/paraglide/messages";
import type { VideoAnalysisStatus } from "~/schema";

function formatVideoDuration(duration: string | null) {
  if (!duration) return null;
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return duration;
  const hours = Number.parseInt(match[1] || "0", 10);
  const minutes = Number.parseInt(match[2] || "0", 10);
  const seconds = Number.parseInt(match[3] || "0", 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
    return duration;
  }
  const pad = (value: number) => value.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

export interface VideoCardProps {
  video: VideoWithStatus;
  isSelected: boolean;
  isSelectable: boolean;
  hideCheckbox?: boolean;
  onSelect: (videoId: string) => void;
  onOpen: (video: VideoWithStatus) => void;
  actionLabel?: string;
  selectionHint?: string;
  selectionLabel?: string;
  hideFooter?: boolean;
}

export function VideoCard({
  video,
  isSelected,
  isSelectable,
  hideCheckbox = false,
  onSelect,
  onOpen,
  actionLabel = "Learn", // This comes from parent, usually handled there
  selectionHint,
  selectionLabel,
  hideFooter = false,
}: VideoCardProps) {
  const isProcessing = video.status === "pending";
  const hasTooManyFailures = (video.failed_count ?? 0) > 3;
  const durationLabel = formatVideoDuration(video.duration);
  const defaultSelectionLabel = isSelectable
    ? m.video_card_select()
    : hasTooManyFailures
      ? m.video_card_paused()
      : isProcessing
        ? m.video_card_processing()
        : m.video_card_locked();
  const defaultSelectionHint = hasTooManyFailures
    ? m.video_card_hint_failed()
    : isProcessing
      ? m.video_card_hint_processing()
      : m.video_card_hint_synced();
  const resolvedSelectionLabel = selectionLabel ?? defaultSelectionLabel;
  const resolvedSelectionHint = selectionHint ?? defaultSelectionHint;
  const showTooltip = !isSelectable && (selectionHint || hasTooManyFailures);

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(video);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={m.aria_open_view({ title: video.title || m.default_video_title() })}
      onClick={() => onOpen(video)}
      onKeyDown={handleCardKeyDown}
      className={`group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-colors duration-150 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40`}
    >
      <div className="relative w-full overflow-hidden bg-muted/30 pb-[56.25%]">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title || m.aria_video_thumbnail()}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground">
            {m.video_no_thumbnail()}
          </div>
        )}

        {/* Selection / Status Badge */}
        <div
          className="absolute left-3 top-3 z-20"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          title={!isSelectable && !showTooltip ? resolvedSelectionHint : undefined}
        >
          {!hideCheckbox &&
            (showTooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <label
                    className={`flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 ${
                      isSelectable ? "" : "opacity-80"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onSelect(video.id)}
                      disabled={!isSelectable}
                      className="h-4 w-4 accent-primary rounded-full cursor-pointer"
                      aria-label={m.aria_select_video({
                        title: video.title || m.default_video_title(),
                      })}
                    />
                    <span>{resolvedSelectionLabel}</span>
                  </label>
                </TooltipTrigger>
                <TooltipContent side="top" className="rounded-lg">
                  {resolvedSelectionHint}
                </TooltipContent>
              </Tooltip>
            ) : (
              <label
                className={`flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 ${
                  isSelectable ? "" : "opacity-80"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onSelect(video.id)}
                  disabled={!isSelectable}
                  className="h-4 w-4 accent-primary rounded-full cursor-pointer"
                  aria-label={m.aria_select_video({
                    title: video.title || m.default_video_title(),
                  })}
                />
                <span>{resolvedSelectionLabel}</span>
              </label>
            ))}
        </div>

        {durationLabel && (
          <div className="absolute bottom-3 right-3 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
            {durationLabel}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col space-y-3 p-4">
        <h3
          className="line-clamp-2 text-sm font-semibold leading-relaxed text-card-foreground"
          title={video.title || m.default_video_title()}
        >
          {video.title || m.default_video_title()}
        </h3>

        {!hideFooter && (
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <AnalysisStatusBadge status={video.status} />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg px-3 text-xs font-medium"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(video);
              }}
            >
              {actionLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalysisStatusBadge({ status }: { status: VideoAnalysisStatus | null }) {
  const resolvedStatus: VideoAnalysisStatus = status || "pending";
  const statusMap = {
    pending: m.status_pending(),
    completed: m.status_completed(),
    failed: m.status_failed(),
  };
  const typeMap: Record<VideoAnalysisStatus, "outline" | "default" | "destructive"> = {
    pending: "outline",
    completed: "default",
    failed: "destructive",
  };
  const classNameMap: Record<VideoAnalysisStatus, string> = {
    pending: "text-xs bg-muted/70 text-muted-foreground border-transparent",
    completed: "bg-muted/70 text-foreground border-transparent",
    failed: "border-destructive/20 bg-destructive/10 text-xs text-destructive",
  };

  return (
    <Badge
      variant={typeMap[resolvedStatus]}
      className={classNameMap[resolvedStatus]}
      title={statusMap[resolvedStatus]}
    >
      {statusMap[resolvedStatus]}
    </Badge>
  );
}
