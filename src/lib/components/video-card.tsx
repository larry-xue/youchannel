import type { KeyboardEvent } from "react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/lib/components/ui/tooltip";
import type { VideoWithStatus } from "~/lib/dashboard/data";
import { formatDate, getVideoPublishedAt, truncate } from "~/lib/dashboard/utils";
import type { VideoAnalysisStatus } from "~/schema";
import * as m from "~/paraglide/messages";

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
            className={`group flex w-full max-w-md cursor-pointer flex-col overflow-hidden rounded-3xl border bg-background/80 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:shadow-md`}
        >
            <div className="relative w-full overflow-hidden bg-muted/40 pb-[56.25%]">
                {video.thumbnail_url ? (
                    <img
                        src={video.thumbnail_url}
                        alt={video.title || m.aria_video_thumbnail()}
                        className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                        {m.video_no_thumbnail()}
                    </div>
                )}
                <div
                    className="absolute left-2 top-2"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    title={!isSelectable && !showTooltip ? resolvedSelectionHint : undefined}
                >
                    {!hideCheckbox &&
                        (showTooltip ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <label
                                        className={`flex items-center gap-2 rounded-full bg-background/80 px-2 py-1 text-[11px] text-foreground shadow ${isSelectable ? "" : "opacity-60"
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => onSelect(video.id)}
                                            disabled={!isSelectable}
                                            className="h-3.5 w-3.5"
                                            aria-label={m.aria_select_video({ title: video.title || m.default_video_title() })}
                                        />
                                        <span>{resolvedSelectionLabel}</span>
                                    </label>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                    {resolvedSelectionHint}
                                </TooltipContent>
                            </Tooltip>
                        ) : (
                            <label
                                className={`flex items-center gap-2 rounded-full bg-background/80 px-2 py-1 text-[11px] text-foreground shadow ${isSelectable ? "" : "opacity-60"
                                    }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => onSelect(video.id)}
                                    disabled={!isSelectable}
                                    className="h-3.5 w-3.5"
                                    aria-label={m.aria_select_video({ title: video.title || m.default_video_title() })}
                                />
                                <span>{resolvedSelectionLabel}</span>
                            </label>
                        ))}
                </div>
                {durationLabel && (
                    <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                        {durationLabel}
                    </div>
                )}
            </div>
            <div className="flex flex-1 flex-col space-y-2 px-3 pb-3 pt-2">
                <p
                    className="text-sm font-semibold leading-snug text-foreground"
                    title={video.title || m.default_video_title()}
                >
                    {truncate(video.title || m.default_video_title(), 48)}
                </p>
                {!hideFooter && (
                    <div className="mt-auto! flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                        <AnalysisStatusBadge
                            status={video.status}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
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

function AnalysisStatusBadge({
    status,
}: {
    status: VideoAnalysisStatus | null;
}) {
    const resolvedStatus: VideoAnalysisStatus = status || "pending";
    const statusMap = {
        pending: m.status_pending(),
        completed: m.status_completed(),
        failed: m.status_failed(),
    }
    const typeMap: Record<VideoAnalysisStatus, "outline" | "default" | "destructive"> = {
        pending: "outline",
        completed: "default",
        failed: "destructive",
    }
    const classNameMap: Record<VideoAnalysisStatus, string> = {
        pending: "text-xs",
        completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        failed: "border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400",
    }

    return (
        <Badge
            variant={typeMap[resolvedStatus]}
            className={classNameMap[resolvedStatus]}
            title={statusMap[resolvedStatus]}
        >
            {statusMap[resolvedStatus]}
        </Badge >
    );
}
