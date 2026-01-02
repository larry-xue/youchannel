import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { PLAYER_ASPECT_RATIO, PLAYER_MIN_HEIGHT } from "../constants";
import { clamp, isBrowser } from "../utils";

type VideoPlayerCardProps = {
  title: string;
  youtubeId?: string | null;
  publishedAt?: string | null;
  isLoading: boolean;
  className?: string;
};

export function VideoPlayerCard({
  title,
  youtubeId,
  isLoading,
  className,
}: VideoPlayerCardProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [playerSize, setPlayerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!isBrowser) return;
    const container = stageRef.current;
    if (!container) return;
    const updateBounds = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      if (!containerWidth || !containerHeight) return;
      const maxWidth = containerWidth;
      const maxHeight = Math.max(PLAYER_MIN_HEIGHT, containerHeight);
      const heightFromWidth = maxWidth / PLAYER_ASPECT_RATIO;
      const widthFromHeight = maxHeight * PLAYER_ASPECT_RATIO;
      const nextHeight =
        heightFromWidth <= maxHeight ? heightFromWidth : maxHeight;
      const nextWidth =
        heightFromWidth <= maxHeight ? maxWidth : widthFromHeight;
      setPlayerSize({
        width: clamp(nextWidth, PLAYER_MIN_HEIGHT * PLAYER_ASPECT_RATIO, maxWidth),
        height: clamp(nextHeight, PLAYER_MIN_HEIGHT, maxHeight),
      });
    };

    updateBounds();
    let resizeObserver: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(updateBounds);
      resizeObserver.observe(container);
    }
    return () => {
      resizeObserver?.disconnect();
    };
  }, []);

  const playerStyle =
    playerSize.width && playerSize.height
      ? { width: playerSize.width, height: playerSize.height }
      : { width: "100%", aspectRatio: "16 / 9" };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col",
        className,
      )}
    >
      <div
        ref={stageRef}
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 pt-4"
      >
        <div className="relative overflow-hidden rounded-2xl bg-muted/30" style={playerStyle}>
          {youtubeId ? (
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {isLoading ? "Loading video..." : "Video not available"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
