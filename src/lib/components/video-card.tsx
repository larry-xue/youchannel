import type { KeyboardEvent } from "react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/lib/components/ui/tooltip";
import type { VideoWithStatus } from "~/lib/dashboard/data";
import { formatDate, getVideoPublishedAt, truncate } from "~/lib/dashboard/utils";
import type { VideoAnalysisSkipReason } from "~/schema";
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
    onSelect: (videoId: string) => void;
    onOpen: (video: VideoWithStatus) => void;
    actionLabel?: string;
    selectionHint?: string;
    selectionLabel?: string;
}

export function VideoCard({
    video,
    isSelected,
    isSelectable,
    onSelect,
    onOpen,
    actionLabel = "Learn", // This comes from parent, usually handled there
    selectionHint,
    selectionLabel,
}: VideoCardProps) {
    const isProcessing =
        video.latest_analysis_status === "pending" ||
        video.latest_analysis_status === "processing";
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
                    {showTooltip ? (
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
                    )}
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
                <p className="text-xs text-muted-foreground">
                    {formatDate(getVideoPublishedAt(video))}
                </p>
                <div className="mt-auto! flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                    <AnalysisStatusBadge
                        count={video.analysis_count}
                        latestAt={video.latest_analysis_at}
                        status={video.latest_analysis_status}
                        skipReason={video.latest_skip_reason}
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
            </div>
        </div>
    );
}

function AnalysisStatusBadge({
    count,
    latestAt,
    status,
    skipReason,
}: {
    count: number;
    latestAt: string | null;
    status: string | null;
    skipReason: VideoAnalysisSkipReason | null;
}) {
    if (count === 0) {
        return (
            <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400"
            >
                {m.status_not_started()}
            </Badge>
        );
    }

    const resolvedStatus = status || "pending";

    if (resolvedStatus === "processing") {
        return (
            <Badge
                variant="outline"
                className="border-blue-500/30 bg-blue-500/10 text-xs text-blue-600 dark:text-blue-400"
            >
                {m.video_card_processing()}
            </Badge>
        );
    }

    if (resolvedStatus === "queued") {
        return (
            <Badge
                variant="outline"
                className="border-blue-500/30 bg-blue-500/10 text-xs text-blue-600 dark:text-blue-400"
            >
                {m.status_queued()}
            </Badge>
        );
    }

    if (resolvedStatus === "skipped") {
        const reasonText =
            skipReason === "quota_exceeded"
                ? m.skip_reason_quota()
                : skipReason === "duration_exceeded"
                    ? m.skip_reason_duration()
                    : skipReason === "video_unavailable"
                        ? m.skip_reason_unavailable()
                        : null;
        return (
            <Badge
                variant="outline"
                className="border-slate-500/30 bg-slate-500/10 text-xs text-slate-600 dark:text-slate-400"
                title={reasonText ? m.status_skipped_with_reason({ reason: reasonText }) : undefined}
            >
                {m.status_skipped()}
            </Badge>
        );
    }

    if (resolvedStatus === "failed") {
        return (
            <Badge
                variant="outline"
                className="border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400"
                title={latestAt ? m.status_failed_last({ date: formatDate(latestAt) }) : undefined}
            >
                {m.status_failed()}
            </Badge>
        );
    }

    return (
        <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400"
            title={latestAt ? m.status_completed_date({ date: formatDate(latestAt) }) : undefined}
        >
            {resolvedStatus === "pending" ? m.status_pending() : m.status_completed()}
        </Badge>
    );
}
