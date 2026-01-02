import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Badge } from "~/lib/components/ui/badge";
import { Button } from "~/lib/components/ui/button";
import { formatDate } from "~/lib/dashboard/utils";
import {
  PLAYER_ASPECT_RATIO,
  PLAYER_DEFAULT_HEIGHT,
  PLAYER_MIN_HEIGHT,
  STORAGE_KEYS,
} from "../constants";
import {
  clamp,
  isBrowser,
  resolveMaxPlayerHeight,
  useLocalStorageState,
} from "../utils";

type VideoPlayerCardProps = {
  title: string;
  youtubeId?: string | null;
  publishedAt?: string | null;
  isLoading: boolean;
};

export function VideoPlayerCard({
  title,
  youtubeId,
  publishedAt,
  isLoading,
}: VideoPlayerCardProps) {
  const [playerHeight, setPlayerHeight] = useLocalStorageState(
    STORAGE_KEYS.playerHeight,
    PLAYER_DEFAULT_HEIGHT,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeState = useRef({
    startX: 0,
    startY: 0,
    startHeight: PLAYER_DEFAULT_HEIGHT,
    isResizing: false,
  });
  const playerWidth = Math.round(playerHeight * PLAYER_ASPECT_RATIO);

  useEffect(() => {
    if (!isBrowser) return;
    const container = containerRef.current;
    if (!container) return;
    const updateBounds = () => {
      const containerWidth = containerRef.current?.clientWidth;
      if (!containerWidth) return;
      const maxHeight = resolveMaxPlayerHeight(containerWidth);
      const minHeight = Math.min(PLAYER_MIN_HEIGHT, maxHeight);
      setPlayerHeight((prev) => {
        const nextHeight = clamp(prev, minHeight, maxHeight);
        return nextHeight === prev ? prev : nextHeight;
      });
    };

    updateBounds();
    let resizeObserver: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(updateBounds);
      resizeObserver.observe(container);
    }
    window.addEventListener("resize", updateBounds);
    return () => {
      window.removeEventListener("resize", updateBounds);
      resizeObserver?.disconnect();
    };
  }, [setPlayerHeight]);

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="mx-auto overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br from-background via-background to-muted/40 shadow-sm"
        style={{ width: playerWidth }}
      >
        <div className="flex flex-col items-center gap-3 px-4 py-4">
          <div
            className="relative w-full overflow-hidden rounded-2xl bg-muted/30"
            style={{ height: playerHeight }}
          >
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
    </div>
  );
}
