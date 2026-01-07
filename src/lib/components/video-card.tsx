import type { KeyboardEvent } from "react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/lib/components/ui/tooltip";
import type { VideoWithStatus } from "~/lib/dashboard/data";
import { formatDate, getVideoPublishedAt, truncate } from "~/lib/dashboard/utils";
import type { VideoAnalysisSkipReason } from "~/schema";

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
}

export function VideoCard({
    video,
    isSelected,
    isSelectable,
    onSelect,
    onOpen,
    actionLabel = "Learn",
}: VideoCardProps) {
    const isProcessing =
        video.latest_analysis_status === "pending" ||
        video.latest_analysis_status === "processing";
    const hasTooManyFailures = (video.failed_count ?? 0) > 3;
    const durationLabel = formatVideoDuration(video.duration);
    const selectionLabel = isSelectable
        ? "Select"
        : hasTooManyFailures
            ? "Paused"
            : isProcessing
                ? "Processing"
                : "Locked";
    const selectionHint = hasTooManyFailures
        ? "This video failed analysis several times and is temporarily locked."
        : isProcessing
            ? "This video is already being analyzed."
            : "Only synced videos can be selected.";

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
            aria-label={`Open learning view for ${video.title || `video`}`}
            onClick={() => onOpen(video)}
            onKeyDown={handleCardKeyDown}
            className={`group flex w-full max-w-md cursor-pointer flex-col overflow-hidden rounded-3xl border bg-background/80 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:shadow-md ${isSelected ? "ring-2 ring-primary/30" : ""
                } ${video.sync_status === "removed"
                    ? "border-amber-500/30 opacity-70"
                    : video.sync_status === "unavailable"
                        ? "border-red-500/30 opacity-70"
                        : "border-border/60"
                }`}
        >
            <div className="relative w-full overflow-hidden bg-muted/40 pb-[56.25%]">
                {video.thumbnail_url ? (
                    <img
                        src={video.thumbnail_url}
                        alt={video.title || "Video thumbnail"}
                        className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                        No thumbnail
                    </div>
                )}
                <div
                    className="absolute left-2 top-2"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                    title={hasTooManyFailures ? undefined : selectionHint}
                >
                    {hasTooManyFailures ? (
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
                                        aria-label={`Select ${video.title || `video`} for analysis`}
                                    />
                                    <span>{selectionLabel}</span>
                                </label>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                This video failed analysis several times and is temporarily locked. Please try again later.
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
                                aria-label={`Select ${video.title || `video`} for analysis`}
                            />
                            <span>{selectionLabel}</span>
                        </label>
                    )}
                </div>
                {video.sync_status !== "synced" && (
                    <div className="absolute right-2 top-2">
                        <VideoSyncStatusBadge status={video.sync_status} />
                    </div>
                )}
                {durationLabel && (
                    <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                        {durationLabel}
                    </div>
                )}
            </div>
            <div className="flex flex-1 flex-col space-y-2 px-3 pb-3 pt-2">
                <p
                    className="text-sm font-semibold leading-snug text-foreground"
                    title={video.title || "Video"}
                >
                    {truncate(video.title || "Video", 48)}
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
                Not started
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
                Processing
            </Badge>
        );
    }

    if (resolvedStatus === "queued") {
        return (
            <Badge
                variant="outline"
                className="border-blue-500/30 bg-blue-500/10 text-xs text-blue-600 dark:text-blue-400"
            >
                Queued
            </Badge>
        );
    }

    if (resolvedStatus === "skipped") {
        const reasonText =
            skipReason === "quota_exceeded"
                ? "Quota exceeded"
                : skipReason === "duration_exceeded"
                    ? "Duration exceeded"
                    : skipReason === "video_unavailable"
                        ? "Video unavailable"
                        : null;
        return (
            <Badge
                variant="outline"
                className="border-slate-500/30 bg-slate-500/10 text-xs text-slate-600 dark:text-slate-400"
                title={reasonText ? `Skipped: ${reasonText}` : undefined}
            >
                Skipped
            </Badge>
        );
    }

    if (resolvedStatus === "failed") {
        return (
            <Badge
                variant="outline"
                className="border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400"
                title={latestAt ? `Last: ${formatDate(latestAt)}` : undefined}
            >
                Failed
            </Badge>
        );
    }

    return (
        <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400"
            title={latestAt ? `Completed: ${formatDate(latestAt)}` : undefined}
        >
            {resolvedStatus === "pending" ? "Pending" : "Completed"}
        </Badge>
    );
}

function VideoSyncStatusBadge({ status }: { status: string }) {
    if (status === "removed") {
        return (
            <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-900/80 text-xs text-amber-200"
            >
                Removed
            </Badge>
        );
    }

    if (status === "unavailable") {
        return (
            <Badge
                variant="outline"
                className="border-red-500/30 bg-red-900/80 text-xs text-red-200"
            >
                Unavailable
            </Badge>
        );
    }

    return null;
}
